from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import generations
import models
from database import engine

# This creates the database tables upon startup if they do not exist yet.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PicApp API")

# Configure CORS to allow the frontend to communicate with the backend
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




