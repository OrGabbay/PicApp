# backend/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# --- Prompt & Generation Schemas ---
class EnhancePromptIn(BaseModel):
    prompt: str

class EnhancePromptOut(BaseModel):
    original_prompt: str
    enhanced_prompt: str

class GenerationCreate(BaseModel):
    original_prompt: str
    enhanced_prompt: Optional[str] = None
    aspect_ratio: Optional[str] = "1:1"

class GenerationOut(BaseModel):
    id: int
    prompt_id: int
    image_url: str
    original_prompt: str
    enhanced_prompt: Optional[str] = None
    created_at: datetime
    is_favorite: bool = False

    class Config:
        from_attributes = True

class PaginatedGenerationsOut(BaseModel):
    items: List[GenerationOut]
    total: int
    page: int
    limit: int
    has_more: bool