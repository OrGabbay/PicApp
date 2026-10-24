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
# Edit .env: put your API key in ANTHROPIC_API_KEY (or leave it empty to use free mode).
# The DATABASE_URL default matches docker-compose.yml.

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

The provider is detected from the key's prefix:

| Key | Prompt enhancement | Image generation |
|-----|-------------------|------------------|
| Anthropic `sk-ant-…` | Claude Opus 5.5 | Free FLUX engine (Anthropic has no image API) |
| OpenAI `sk-proj-…` | GPT-4o mini | DALL-E 3 |
| Google AI Studio `AIza…` | Gemini | Imagen 3 |
| Groq `gsk_…` | Llama 3.3 70B | Free FLUX engine |
| *No key* | Built-in style presets | Free FLUX engine |

If a key can't be used (invalid, expired, out of credits, rate-limited…), the Studio shows a popup with the reason and the image is generated with the free engine instead.
Calls made with your key accrue that provider's standard API charges.

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
│   ├── main.py                 # FastAPI app, CORS, router registration
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
│   │   └── settings/page.tsx   # API key management
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
| `POST` | `/api/v1/providers/detect` | — | Detect which provider a key belongs to |
| `POST` | `/api/v1/prompts/enhance` | optional key | Enhance a prompt |
| `POST` | `/api/v1/generations/create` | optional key | Generate an image |
| `GET` | `/api/v1/generations/history` | — | Paginated generation history |
| `GET` | `/api/v1/generations/stats` | — | Generation and favorite counts |
| `POST` | `/api/v1/generations/{id}/favorite` | — | Toggle favorite |
| `DELETE` | `/api/v1/generations/{id}` | — | Delete a generation |

> **Note:** Authentication is currently mocked (all requests treated as `user_id=1`). A real JWT system will be added in a future phase.

---

## Security Notes

This project is set up for **local development**:

- Never commit `backend/.env` or `frontend/.env.local` — they are git-ignored; only the `.example` templates are tracked.
- The database password in `docker-compose.yml` is a local default. Change it (and `DATABASE_URL` in `backend/.env`) before running anywhere other than your own machine.
- A key saved in **Settings** is stored in the browser's `localStorage` and sent to your local backend on each request.
- Images saved by the backend go to `backend/static/` (git-ignored).

---

## Supported Aspect Ratios

| Value | Dimensions | Best For |
|-------|-----------|---------|
| `1:1` | 1024×1024 | Social media, avatars |
| `16:9` | 1920×1080 | Wallpapers, banners |
| `9:16` | 576×1024 | Mobile wallpapers, stories |
| `4:3` | 1024×768 | Classic photo format |
