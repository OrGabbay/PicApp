# Production image of the FastAPI backend (used by docker-compose.app.yml)
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# Run as an unprivileged user; it only needs to write the saved images
RUN useradd --create-home --uid 10001 picapp \
    && mkdir -p static/generations \
    && chown -R picapp:picapp static
USER picapp

EXPOSE 8000
# One process on purpose: rate limits and revoked tokens are kept in memory
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]
