# backend/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# --- Prompt & Generation Schemas ---
class EnhancePromptIn(BaseModel):
    prompt: str
    style: Optional[str] = None
    provider: Optional[str] = None

class EnhancePromptOut(BaseModel):
    original_prompt: str
    enhanced_prompt: str
    engine: str = "Preset"
    provider: Optional[str] = None
    error: Optional[str] = None

class DetectProviderIn(BaseModel):
    key: str

class DetectProviderOut(BaseModel):
    provider: str
    name: str

class GenerateImageRequest(BaseModel):
    """Request body for POST /generations/create."""
    prompt: str
    aspect_ratio: Optional[str] = "1:1"
    style: Optional[str] = None
    provider: Optional[str] = None

class GenerationOut(BaseModel):
    id: int
    prompt_id: int
    image_url: str
    original_prompt: str
    enhanced_prompt: Optional[str] = None
    engine: Optional[str] = None
    created_at: datetime
    is_favorite: bool = False
    key_warning: Optional[str] = None

    class Config:
        from_attributes = True

class FavoriteToggleOut(BaseModel):
    generation_id: int
    is_favorite: bool

class StatsOut(BaseModel):
    total_generations: int
    total_favorites: int

class PaginatedGenerationsOut(BaseModel):
    items: List[GenerationOut]
    total: int
    page: int
    limit: int
    has_more: bool