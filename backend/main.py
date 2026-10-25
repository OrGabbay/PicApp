import hashlib
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load backend/.env before importing modules that read env vars at import time
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from routers import generations
import mailer
import models
import providers
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
from rate_limit import (
    client_ip,
    login_account_limiter,
    login_failure_limiter,
    login_ip_limiter,
    register_limiter,
    reset_email_limiter,
    reset_ip_limiter,
)

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
    email = str(credentials.email)
    # Wrong passwords are counted per account + IP, so one attacker can't lock the real user out
    # of their own IP, and per account from any IP with a looser limit, so guessing spread over
    # many IPs is still stopped
    failure_key = f"{email}|{ip}"
    login_ip_limiter.check_and_hit(ip)
    login_failure_limiter.check(failure_key)
    login_account_limiter.check(email)

    def record_failure() -> None:
        login_failure_limiter.hit(failure_key)
        login_account_limiter.hit(email)

    user = (
        db.query(models.User)
        # lower(): accounts created before emails were normalized may contain capitals
        .filter(func.lower(models.User.email) == email)
        .first()
    )

    if user is None:
        # Run a hash check anyway so response time doesn't reveal whether the email exists
        verify_password_dummy(credentials.password)
        record_failure()
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
        )

    if not verify_password(credentials.password, user.password_hash):
        record_failure()
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
        .filter(func.lower(models.User.email) == str(user_data.email))
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


RESET_TOKEN_MINUTES = 30
INVALID_RESET_LINK = "Invalid or expired reset link"


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@app.post("/auth/password-reset/request", status_code=202)
def request_password_reset(
    payload: schemas.PasswordResetRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Emails a reset link if the account exists. The answer is the same either way, so it
    doesn't reveal which emails are registered."""
    reset_ip_limiter.check_and_hit(client_ip(request))
    email = str(payload.email)
    answer = {"detail": "If an account exists for that email, a reset link has been sent."}

    user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
    if user is None or reset_email_limiter.retry_after(email):
        return answer
    reset_email_limiter.hit(email)

    # Only the newest link works
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user.id).delete()
    token = secrets.token_urlsafe(32)
    db.add(models.PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES),
    ))
    db.commit()

    # Sent after the response, so its timing doesn't reveal that the account exists either
    background_tasks.add_task(mailer.send_password_reset, user.email, token, RESET_TOKEN_MINUTES)
    return answer


@app.post("/auth/password-reset/confirm", status_code=204)
def confirm_password_reset(
    payload: schemas.PasswordResetConfirm,
    request: Request,
    db: Session = Depends(get_db),
):
    reset_ip_limiter.check_and_hit(client_ip(request))
    reset = (
        db.query(models.PasswordResetToken)
        .filter(models.PasswordResetToken.token_hash == _hash_reset_token(payload.token))
        .first()
    )
    if reset is None or reset.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail=INVALID_RESET_LINK)

    user = db.get(models.User, reset.user_id)
    user.password_hash = hash_password(payload.password)
    # The link is single-use
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user.id).delete()
    db.commit()
    return Response(status_code=204)


@app.post("/auth/delete-account", status_code=204)
def delete_account(
    payload: schemas.DeleteAccountIn,
    request: Request,
    token: dict = Depends(get_token_payload),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently deletes the account with its prompts, generations, favorites and image files.
    Asks for the password again, so a session left open on a shared computer isn't enough."""
    email = current_user.email.lower()
    failure_key = f"{email}|{client_ip(request)}"
    login_failure_limiter.check(failure_key)
    login_account_limiter.check(email)

    if not verify_password(payload.password, current_user.password_hash):
        login_failure_limiter.hit(failure_key)
        login_account_limiter.hit(email)
        raise HTTPException(status_code=403, detail="Incorrect password")

    image_urls = [generation.image_url for generation in current_user.generations]
    db.delete(current_user)
    db.commit()
    # Remove the files only once the database change succeeded
    for image_url in image_urls:
        providers.delete_saved_image(image_url)
    revoke_token(token["jti"], token["exp"])
    return Response(status_code=204)
