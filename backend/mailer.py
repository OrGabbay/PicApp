# backend/mailer.py
"""Sends emails (password reset links) through the SMTP server configured in backend/.env."""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# Public address of the frontend, used in links inside emails
APP_URL = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST", "").strip())


def send_email(to: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    # "starttls" (port 587), "ssl" (port 465) or "none" (local test servers only)
    security = os.getenv("SMTP_SECURITY", "starttls").strip().lower()

    message = EmailMessage()
    message["From"] = os.getenv("SMTP_FROM", "").strip() or username
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    if security == "ssl":
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=20)
    else:
        server = smtplib.SMTP(host, port, timeout=20)
    with server:
        if security == "starttls":
            server.starttls(context=context)
        if username:
            server.login(username, password)
        server.send_message(message)


def send_password_reset(to: str, token: str, valid_minutes: int) -> None:
    """Emails a reset link. Without SMTP settings the link is written to the backend log
    instead, so whoever runs the app on their own computer can still reset a password."""
    link = f"{APP_URL}/reset-password?token={token}"
    if not smtp_configured():
        logger.warning(
            "SMTP is not configured, so no email was sent. Password reset link for %s "
            "(valid %d minutes): %s", to, valid_minutes, link,
        )
        return
    body = (
        "Someone asked to reset the password of your PicApp account.\n\n"
        f"Choose a new password here (the link is valid for {valid_minutes} minutes):\n{link}\n\n"
        "If this wasn't you, ignore this email: your password stays the same."
    )
    try:
        send_email(to, "Reset your PicApp password", body)
    except (OSError, smtplib.SMTPException) as exc:
        # Runs in the background: the user already got a generic answer, so only log it
        logger.error("Could not send the password reset email to %s: %s", to, exc)
