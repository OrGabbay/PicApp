# PicApp — AI Image Generator

A full-stack web app for AI-powered image generation. Type a prompt → an AI model (with your own key) enhances it → the image is generated → results are saved to your gallery. Works without any key using the free Pollinations.ai engine.

**Stack:** Next.js 16 · React 19 · Tailwind CSS 4 · FastAPI · PostgreSQL · SQLAlchemy · Anthropic Claude

---

## Quick Start

### Prerequisites
| Tool | Purpose |
|------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Runs PostgreSQL |
| Python 3.10+ | Backend runtime |
| Node.js 20.9+ | Frontend runtime (required by Next.js 16) |
| API key *(optional)* | Anthropic, OpenAI, Google AI Studio or Groq — see [API Keys](#api-keys) |

---

### 1 — Start the Database

```bash
docker compose up -d
```

This starts a PostgreSQL 15 container on **localhost:5432** (not exposed to your network). Data is persisted in a Docker volume.
You don't need to create the database or tables yourself — the container creates the `picapp_db` database and the backend creates all tables automatically on first start.

---

### 2 — Start the Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
# (Windows: if this fails with "No such file or directory" on a long path, clone the repo
#  to a shorter folder or enable long paths: https://pip.pypa.io/warnings/enable-long-paths)
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env:
#  - JWT_SECRET_KEY (required): generate one with
#      python -c "import secrets; print(secrets.token_urlsafe(48))"
#  - DATABASE_URL: the default matches docker-compose.yml

# Start the API server
uvicorn main:app --reload
```

- API running at → **http://localhost:8000**
- Interactive API docs → **http://localhost:8000/docs**

---

### 3 — Start the Frontend

```bash
cd frontend

npm install

cp .env.local.example .env.local   # creates NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

- App running at → **http://localhost:3000**

---

### 4 — Generate Your First Image

1. Open **http://localhost:3000**
2. *(Optional)* Click **⚙️ Settings** in the navbar, paste your API key and click **Save Key**
   — a key saved here overrides the one in `backend/.env`
3. Navigate to **Studio**
4. Type a prompt, choose an aspect ratio, and click **🎨 Generate Image**

---

## API Keys

Pick the image engine from the **Image Engine** dropdown in the Studio. Paid engines run on the user's own account with that company: connect its API key under **Settings → AI Provider Keys** (one card per provider). Keys are a **logged-in feature** — guests always use the free engine, and the backend ignores keys sent without a login. Choosing a locked engine opens a popup that asks guests to log in, or links logged-in users straight to that provider's card.

| Engine | Model (override in `backend/.env`) | Needs | ≈ cost / image |
|--------|-----------------------------------|-------|----------------|
| **Free** | | | |
| Pollinations Classic | Pollinations' anonymous API | nothing | free (basic quality, ~1 image / 45 s per server) |
| FLUX.2 klein · Z-Image Turbo · FLUX.1 schnell · GPT Image 1 mini | via Pollinations' keyed API | free Pollinations account (key `sk_…`) | free quest pollen — e.g. ~500 FLUX.1 schnell images per pollen |
| FLUX.1 schnell (Cloudflare) | `@cf/black-forest-labs/flux-1-schnell` (`CLOUDFLARE_IMAGE_MODEL`) | free Cloudflare account (account ID + Workers AI token) | free daily allowance (~100 images/day, square only) |
| **Paid** | | | |
| OpenAI GPT Image 2 | `gpt-image-2` (`OPENAI_IMAGE_MODEL`) | OpenAI key | $0.05 |
| Google Nano Banana 2 | `gemini-3.1-flash-image` (`GEMINI_IMAGE_MODEL`) | Google AI Studio key | $0.07 |
| Google Nano Banana Pro | `gemini-3-pro-image` (`GEMINI_PRO_IMAGE_MODEL`) | Google AI Studio key | $0.13 |
| FLUX.2 Pro | `flux-2-pro-preview` (`FLUX_MODEL`) | Black Forest Labs key | $0.03 |

**Prompt enhancement** (the *Enhance Prompt* button, and generations with the free engine) uses one connected key — Anthropic, OpenAI, Google or Groq — chosen under *Settings → Prompt enhancement* (default: automatic). Keys always come from the user: the server never uses a key of its own, so open registration can't run up your bill. Paid image engines get the prompt as written, since they understand prompts well.

If a key can't be used (invalid, expired, out of credits, rate-limited…), the Studio shows a popup with the reason and the image is generated with the free engine instead.

### The free engines

The **Free** group in the dropdown costs nothing. Pollinations Classic needs no account; the others need a free account with Pollinations or Cloudflare, connected under *Settings → AI Provider Keys* (marked **Free**). If a chosen engine's key fails and the Classic fallback is busy too, the Studio shows both the key problem and the countdown.

**Pollinations Classic:**

- The backend downloads each free image when it is generated and stores it in `backend/static/generations/`, so the gallery never depends on Pollinations afterwards. Guest images (not in any gallery) are deleted after 24 hours.
- Pollinations' free tier allows **about one image every 45 seconds for the whole server**. When it's busy, the Studio shows a countdown and re-enables **Generate** when the engine is ready — nothing broken is ever saved.
- Set `POLLINATIONS_TOKEN` in `backend/.env` (a key from [enter.pollinations.ai](https://enter.pollinations.ai)) to switch Classic to Pollinations' keyed API and a much better model (`POLLINATIONS_DEFAULT_MODEL`, default FLUX.2 klein) for everyone.
Calls made with your key accrue that provider's standard API charges.

---

## Settings & Preferences

The **⚙️ Settings** page lets every visitor personalize the app (saved per browser in `localStorage`):

| Setting | Options |
|---------|---------|
| Theme | Dark · Light · System |
| Language | English · עברית (right-to-left) · Español · Français |
| Gallery thumbnail size | Small · Medium · Large |
| Gallery order | Newest first · Oldest first |
| Gallery layout | Grid (square) · Masonry (original shapes) |

- **Translations** live in `frontend/src/i18n/` — `en.ts` defines every key, and `he.ts` / `es.ts` / `fr.ts` are type-checked against it, so a missing translation fails `tsc`.
- **Light theme**: the UI is written with dark classes; `globals.css` mirrors Tailwind's palette under `:root[data-theme="light"]` so every page flips without per-component changes.
- Theme and text direction are applied by a tiny inline script before first paint (no flash).

---

## How It Works

```
User types prompt
       ↓
Frontend → POST /api/v1/generations/create (body: prompt, aspect_ratio, style)
           Header: x-api-key (user's key from Settings, optional)
       ↓
Backend (providers.py) → detects the provider and enhances the prompt / generates the image
       ↓                 (falls back to the free Pollinations.ai engine if the key fails)
Backend → Saves Prompt + Generation rows to PostgreSQL
       ↓
Backend → Returns GenerationOut (id, image_url, enhanced_prompt, engine, key_warning, …)
       ↓
Frontend renders the image and shows a popup if key_warning is set
```

---

## Project Structure

```
PicApp/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, router registration, /auth endpoints
│   ├── security.py             # Password hashing (argon2) and JWT tokens
│   ├── auth.py                 # get_current_user / get_optional_user dependencies
│   ├── database.py             # Engine, session, get_db dependency
│   ├── models.py               # SQLAlchemy ORM models (User, Prompt, Generation, Favorite)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── providers.py            # Key detection, AI provider calls, free-engine fallback
│   ├── routers/
│   │   └── generations.py      # /prompts/enhance, /generations/create, /generations/history
│   ├── alembic/                # Database migration scripts
│   ├── .env.example            # Environment variable template
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Landing page
│   │   ├── studio/page.tsx     # Image generation UI (main feature)
│   │   ├── gallery/page.tsx    # All generations with lightbox
│   │   ├── profile/page.tsx    # User stats
│   │   ├── settings/page.tsx   # API key management
│   │   ├── login/, register/   # Auth forms
│   │   ├── account/            # Logged-in user page
│   │   ├── api/auth/           # Login/register/logout routes that set or clear the token cookie
│   │   └── api/backend/        # Proxy that forwards API calls with the token from the cookie
│   ├── components/ui/          # shadcn UI components (Button, Card, Input, Label)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx      # Sticky nav with active states
│   │   │   └── ImageCard.tsx   # Reusable image thumbnail
│   │   ├── lib/api.ts          # Typed fetch functions for all endpoints
│   │   └── types/api.ts        # Shared TypeScript interfaces
│   └── .env.local.example
└── docker-compose.yml          # PostgreSQL service
```

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | — | Health check |
| `POST` | `/auth/register` | — | Create an account (email + password) |
| `POST` | `/auth/login` | — | Log in, returns a JWT access token (30 min) |
| `GET` | `/auth/me` | Bearer token | Current user |
| `POST` | `/api/v1/providers/detect` | — | Detect which provider a key belongs to |
| `POST` | `/api/v1/prompts/enhance` | optional key | Enhance a prompt |
| `POST` | `/api/v1/generations/create` | optional token + key | Generate an image (saved to the gallery only when logged in) |
| `GET` | `/api/v1/generations/history` | Bearer token | Your paginated gallery |
| `GET` | `/api/v1/generations/stats` | Bearer token | Your generation and favorite counts |
| `POST` | `/api/v1/generations/{id}/favorite` | Bearer token | Toggle favorite on one of your images |
| `DELETE` | `/api/v1/generations/{id}` | Bearer token | Delete one of your images |

> **Note:** Guests can generate images, but only logged-in users get them saved to their personal gallery.
> The browser never handles the token directly: it is kept in an httpOnly cookie, and `frontend/app/api/backend/[...path]` forwards requests to the backend with the token attached.

---

## Security Notes

**Built in:**

- **Passwords**: hashed with argon2; must be 8–128 characters with at least one letter and one number.
- **Sessions**: JWT in an httpOnly cookie (30 min), revoked on the server at logout. The browser never handles the token — `frontend/app/api/backend/[...path]` attaches it.
- **Rate limits** (`backend/rate_limit.py`, in memory): 5 wrong passwords per account per 15 min, 20 login attempts per IP per 5 min, 5 sign-ups per IP per hour, 5 images/min for guests and 15/min per user.
- **Access control**: users can only see, favorite and delete their own images; API keys are ignored for guests.
- **CSRF**: state-changing requests through Next.js must come from the app's own origin.
- **Headers**: Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy on the frontend (`next.config.ts`); HSTS in production builds.

**Before deploying anywhere other than your own machine:**

- Never commit `backend/.env` or `frontend/.env.local` — they are git-ignored; only the `.example` templates are tracked.
- Change the database password: set `POSTGRES_PASSWORD` in a `.env` file next to `docker-compose.yml` and update `DATABASE_URL` in `backend/.env`.
- Serve everything over HTTPS (secure cookies and HSTS turn on automatically in production builds).
- Set `PUBLIC_BACKEND_URL` and `CORS_ORIGINS` (backend) and `BACKEND_URL` / `PUBLIC_BACKEND_URL` (frontend) to your real addresses.
- Per-IP rate limits need the visitor's real IP: put Next.js behind a reverse proxy that overwrites `X-Forwarded-For` and set `TRUST_PROXY_HEADERS=true`. Without it, per-IP limits count all traffic together, and the login lockout can't tell an attacker's IP from the real user's (the frontend logs a warning at startup in production).
- Rate limits and revoked tokens live in memory, so they reset on restart and assume a single backend process.

**Good to know:** a key saved in **Settings** is stored in the browser's `localStorage` (protected by the CSP, removed on logout). Images saved by the backend go to `backend/static/` (git-ignored) and are public to anyone who has their unguessable URL.

---

## Supported Aspect Ratios

| Value | Dimensions | Best For |
|-------|-----------|---------|
| `1:1` | 1024×1024 | Social media, avatars |
| `16:9` | 1920×1080 | Wallpapers, banners |
| `9:16` | 576×1024 | Mobile wallpapers, stories |
| `4:3` | 1024×768 | Classic photo format |
