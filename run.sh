#!/usr/bin/env bash
# PicApp launcher for macOS / Linux:  ./run.sh [start|stop|logs|backup|restore]
#   start   build (first time / after updates) and start PicApp, then open it in the browser
#   stop    stop PicApp (your images and accounts are kept)
#   logs    show the app log (password reset links appear here when no email server is set up)
#   backup  save the database and images to the backups folder
#   restore <folder>  put a backup back (replaces the current accounts and images)
set -euo pipefail
cd "$(dirname "$0")"

APP_URL="http://localhost:3000"
COMPOSE=(docker compose -f docker-compose.app.yml --env-file app.env)

fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

new_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; fi
}

wait_for_docker() {
  command -v docker >/dev/null 2>&1 \
    || fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run PicApp again."
  docker info >/dev/null 2>&1 && return
  if [ "$(uname)" = "Darwin" ]; then echo "Starting Docker Desktop..."; open -a Docker || true; fi
  echo "Waiting for Docker to be ready (this can take a minute)..."
  for _ in $(seq 60); do
    sleep 3
    docker info >/dev/null 2>&1 && return
  done
  fail "Docker is not running. Start Docker Desktop, wait until it is ready, and run PicApp again."
}

initialize_settings() {
  [ -f app.env ] && return
  # A database from an earlier install only accepts the password in its original app.env
  if docker volume inspect picapp-app_db_data >/dev/null 2>&1; then
    fail "app.env is missing, but PicApp data from an earlier start still exists. Put the old app.env back next to run.sh. (To start over and delete all PicApp accounts and images instead, run: docker compose -f docker-compose.app.yml -p picapp-app down -v)"
  fi

  echo "First start: creating app.env with new random secrets..."
  local token=""
  echo
  echo "Optional: paste a free Pollinations token for faster, better free images"
  echo "(create one at https://enter.pollinations.ai), or just press Enter to skip."
  read -r -p "Pollinations token: " token || true
  token="$(printf '%s' "$token" | tr -d '[:space:]')"
  case "$token" in
    *[!A-Za-z0-9_.-]*) echo "That doesn't look like a Pollinations token; skipped (you can add it to app.env later)."; token="" ;;
  esac

  local db_password jwt_secret
  db_password="$(new_secret)"; jwt_secret="$(new_secret)"
  # Created private: it holds the database password
  (umask 077; sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$db_password|" \
      -e "s|^JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$jwt_secret|" \
      -e "s|^POLLINATIONS_TOKEN=.*|POLLINATIONS_TOKEN=$token|" app.env.example > app.env)
  echo "Saved app.env (keep this file: it holds your database password)."
}

open_browser() {
  if command -v open >/dev/null 2>&1; then open "$APP_URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$APP_URL" >/dev/null 2>&1 || true; fi
}

wait_for_docker

case "${1:-start}" in
  start)
    initialize_settings
    echo
    echo "Starting PicApp. The first start builds the app and can take several minutes..."
    "${COMPOSE[@]}" up -d --build --wait \
      || fail "PicApp could not start. Run './run.sh logs' to see why. If a port is in use, close other programs using ports 3000 or 8000."
    printf '\n\033[32mPicApp is running at %s\033[0m\n' "$APP_URL"
    echo "It keeps running in the background (even after a restart, while Docker runs)."
    echo "To stop it, run: ./run.sh stop"
    open_browser
    ;;
  stop)
    "${COMPOSE[@]}" down || fail "Could not stop PicApp."
    echo "PicApp stopped. Your accounts and images are kept."
    ;;
  logs)
    "${COMPOSE[@]}" logs --tail 200 -f
    ;;
  backup)
    folder="backups/$(date +%Y-%m-%d_%H-%M-%S)"
    mkdir -p "$folder"
    "${COMPOSE[@]}" exec -T db pg_dump -U postgres -d picapp_db --clean --if-exists -f /tmp/picapp.sql \
      || fail "Backup failed: is PicApp running? Start it first."
    "${COMPOSE[@]}" cp db:/tmp/picapp.sql "$folder/database.sql"
    "${COMPOSE[@]}" cp backend:/app/static/generations "$folder/images" || fail "Backup of the images failed."
    printf '\033[32mBackup saved to %s\033[0m\n' "$folder"
    ;;
  restore)
    folder="${2:-}"
    [ -n "$folder" ] && [ -f "$folder/database.sql" ] \
      || fail "Usage: ./run.sh restore backups/<folder>   (a folder made by './run.sh backup')"
    echo "This replaces all current PicApp accounts and images with the backup in $folder."
    read -r -p "Type yes to continue: " answer || true
    [ "${answer:-}" = "yes" ] || fail "Restore cancelled."
    "${COMPOSE[@]}" cp "$folder/database.sql" db:/tmp/picapp.sql || fail "Restore failed: is PicApp running? Start it first."
    "${COMPOSE[@]}" exec -T db psql -U postgres -d picapp_db -q -v ON_ERROR_STOP=1 -f /tmp/picapp.sql \
      || fail "Restoring the database failed."
    if [ -d "$folder/images" ]; then
      "${COMPOSE[@]}" cp "$folder/images/." backend:/app/static/generations || fail "Restoring the images failed."
    fi
    printf '\033[32mBackup restored.\033[0m\n'
    ;;
  *)
    fail "Unknown command '$1'. Use: start, stop, logs, backup or restore."
    ;;
esac
