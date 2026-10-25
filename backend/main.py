import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load backend/.env before importing modules that read env vars at import time
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from routers import generations
import models
import schemas
from auth import get_current_user, get_token_payload
from database import engine, SessionLocal, get_db
from security import (
    hash_password,
    verify_password,
    verify_password_dummy,
    create_access_token,
    revoke_token,
)
from rate_limit import client_ip, login_failure_limiter, login_ip_limiter, register_limiter

# Ensure static storage directory exists for saved generated images
STATIC_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
GENERATIONS_DIR = os.path.join(STATIC_ROOT, "generations")
os.makedirs(GENERATIONS_DIR, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema is created
    models.Base.metadata.create_all(bind=engine)

    # Databases created by older versions contain a demo user inserted with an explicit id,
    # which doesn't advance Postgres' id sequence; resync it so /auth/register can't collide
    if engine.dialect.name == "postgresql":
        db = SessionLocal()
        try:
            db.execute(text(
                "SELECT setval(pg_get_serial_sequence('users', 'id'), "
                "(SELECT COALESCE(MAX(id), 0) + 1 FROM users), false)"
            ))
            db.commit()
        finally:
            db.close()

    yield

app = FastAPI(title="PicApp API", version="1.0.0", lifespan=lifespan)

# Configure CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    # Comma-separated list, e.g. CORS_ORIGINS=https://picapp.example.com
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response

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
    request: Request,
    db: Session = Depends(get_db),
):
    ip = client_ip(request)
    # Keyed on the account, not the IP, so changing (or faking) the IP doesn't reset the count
    failure_key = str(credentials.email).lower()
    login_ip_limiter.check_and_hit(ip)
    login_failure_limiter.check(failure_key)

    user = (
        db.query(models.User)
        .filter(models.User.email == str(credentials.email))
        .first()
    )

    if user is None:
        # Run a hash check anyway so response time doesn't reveal whether the email exists
        verify_password_dummy(credentials.password)
        login_failure_limiter.hit(failure_key)
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    if not verify_password(credentials.password, user.password_hash):
        login_failure_limiter.hit(failure_key)
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user,
    }

@app.post("/auth/logout", status_code=204)
def logout(payload: dict = Depends(get_token_payload)):
    """Revokes the current token so it can't be reused even if it was copied."""
    revoke_token(payload["jti"], payload["exp"])
    return Response(status_code=204)


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
    request: Request,
    db: Session = Depends(get_db),
):
    register_limiter.check_and_hit(client_ip(request))
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
