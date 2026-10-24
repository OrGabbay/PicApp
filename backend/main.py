import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load backend/.env before importing modules that read env vars at import time
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import generations
import models
from database import engine, SessionLocal

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
