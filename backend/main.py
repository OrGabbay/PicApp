import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load backend/.env before importing modules that read env vars at import time
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import jwt
from jwt.exceptions import InvalidTokenError

from routers import generations
import models
import schemas
from database import engine, SessionLocal, get_db
from security import (
    hash_password,
    verify_password,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
)

# Ensure static storage directory exists for saved generated images
STATIC_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
GENERATIONS_DIR = os.path.join(STATIC_ROOT, "generations")
os.makedirs(GENERATIONS_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema is created
    models.Base.metadata.create_all(bind=engine)

    # Ensure default user (id=1) exists for developmental / demo mode
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.id == 1).first()
        if not user:
            demo_user = models.User(
                id=1,
                email="test@example.com",
                password_hash="mock_hash_for_development"
            )
            db.add(demo_user)
            db.commit()

        # The demo user is inserted with an explicit id, which doesn't advance Postgres' id
        # sequence; resync it so the first /auth/register doesn't collide with id=1
        if engine.dialect.name == "postgresql":
            db.execute(text(
                "SELECT setval(pg_get_serial_sequence('users', 'id'), "
                "(SELECT COALESCE(MAX(id), 1) FROM users))"
            ))
            db.commit()
    finally:
        db.close()

    yield

app = FastAPI(title="PicApp API", version="1.0.0", lifespan=lifespan)

# Configure CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files to serve locally generated images (DALL-E 3, Imagen 3, etc.)
app.mount("/static", StaticFiles(directory=STATIC_ROOT), name="static")

app.include_router(generations.router, prefix="/api/v1", tags=["Generations"])


@app.get("/")
def read_root():
    return {
        "message": "Welcome to the PicApp API",
        "status": "online",
        "version": "1.0.0"
    }

@app.post("/auth/login", response_model=schemas.TokenResponse)
def login(
    credentials: schemas.UserLogin,
    db: Session = Depends(get_db),
):
    user = (
        db.query(models.User)
        .filter(models.User.email == str(credentials.email))
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user,
    }

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    auth_error = HTTPException(
        status_code=401,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise auth_error

    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
        user_id = int(payload["sub"])
    except (InvalidTokenError, ValueError, TypeError):
        raise auth_error

    user = db.get(models.User, user_id)

    if user is None:
        raise auth_error

    return user


@app.get("/auth/me", response_model=schemas.UserOut)
def read_current_user(
    current_user: models.User = Depends(get_current_user),
):
    return current_user

@app.post(
    "/auth/register",
    response_model=schemas.UserOut,
    status_code=201,
)
def register(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    existing_user = (
        db.query(models.User)
        .filter(models.User.email == str(user_data.email))
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email already registered",
        )

    new_user = models.User(
        email=str(user_data.email),
        password_hash=hash_password(user_data.password),
    )

    db.add(new_user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Could not create user: conflicting data",
        )

    db.refresh(new_user)
    return new_user
