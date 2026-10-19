from fastapi import FastAPI
from routers import generations
import models
from database import engine

# This creates the database tables upon startup if they do not exist yet.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PicApp API")

app.include_router(generations.router, prefix="/api/v1", tags=["Generations"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the PicApp API"}
