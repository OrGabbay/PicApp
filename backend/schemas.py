# backend/schemas.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime

# Password rules, shared with the register form (frontend/app/register/page.tsx).
# The upper bound keeps a huge password from tying up the (deliberately slow) argon2 hasher.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

# Prompt limits. The Studio textarea allows 2000 characters (frontend/app/studio/page.tsx);
# the extra room is for an enhanced prompt (LLM rewrite or style preset) sent back as the prompt.
PROMPT_MAX_LENGTH = 4000
SHORT_FIELD_MAX_LENGTH = 50  # style and provider names
API_KEY_MAX_LENGTH = 512
ASPECT_RATIO_PATTERN = r"^(1:1|16:9|9:16|4:3)$"  # providers.ASPECT_RATIO_SIZES

# --- Auth Schemas ---
def _normalize_email(value: str) -> str:
    # Emails are case-insensitive in practice: store and look them up in lowercase
    return value.lower()

def _check_password_strength(value: str) -> str:
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain at least one letter and one number")
    return value

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _check_password_strength(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

class PasswordResetRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def password_strength(cls, value: str) -> str:
        return _check_password_strength(value)

class DeleteAccountIn(BaseModel):
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
    prompt: str = Field(max_length=PROMPT_MAX_LENGTH)
    style: Optional[str] = Field(default=None, max_length=SHORT_FIELD_MAX_LENGTH)
    provider: Optional[str] = Field(default=None, max_length=SHORT_FIELD_MAX_LENGTH)

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
    key: str = Field(max_length=API_KEY_MAX_LENGTH)

class DetectProviderOut(BaseModel):
    provider: str
    name: str

class GenerateImageRequest(BaseModel):
    """Request body for POST /generations/create."""
    prompt: str = Field(max_length=PROMPT_MAX_LENGTH)
    aspect_ratio: Optional[str] = Field(default="1:1", pattern=ASPECT_RATIO_PATTERN)
    style: Optional[str] = Field(default=None, max_length=SHORT_FIELD_MAX_LENGTH)
    provider: Optional[str] = Field(default=None, max_length=SHORT_FIELD_MAX_LENGTH)
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