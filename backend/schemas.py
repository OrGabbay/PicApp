# backend/schemas.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime

# Password rules, shared with the register form (frontend/app/register/page.tsx).
# The upper bound keeps a huge password from tying up the (deliberately slow) argon2 hasher.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one letter and one number")
        return value

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)

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
    # Machine-readable reason (see providers.KeyIssue) so the frontend can translate it
    error_code: Optional[str] = None
    error_provider: Optional[str] = None

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
    # Image engine chosen in the Studio (see providers.IMAGE_ENGINES)
    engine: str = Field(
        default="free",
        pattern="^(free|openai|gemini|gemini-pro|flux|pollinations-(klein|zimage|schnell|gptmini)|cloudflare-schnell)$",
    )

class GenerationOut(BaseModel):
    # id / prompt_id are None for guest generations, which are not saved
    id: Optional[int] = None
    prompt_id: Optional[int] = None
    image_url: str
    original_prompt: str
    enhanced_prompt: Optional[str] = None
    engine: Optional[str] = None
    created_at: datetime
    is_favorite: bool = False
    key_warning: Optional[str] = None
    key_warning_code: Optional[str] = None
    key_warning_provider: Optional[str] = None
    key_warning_fallback: Optional[str] = None  # "free" or "partial"
    saved: bool = True

    class Config:
        from_attributes = True

class BulkDeleteIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=100)

class BulkDeleteOut(BaseModel):
    deleted: int

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