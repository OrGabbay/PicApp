from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import jwt
from jwt.exceptions import InvalidTokenError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import models
import schemas
from database import SessionLocal, engine
from security import (
    hash_password,
    verify_password,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PicApp API")
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allows your Next.js frontend
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

app.include_router(generations.router, prefix="/api/v1", tags=["Generations"])


@app.get("/")
def read_root():
    return {"message": "Welcome to the PicApp API"}

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

