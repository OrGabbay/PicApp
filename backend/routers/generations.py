# backend/routers/generations.py
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
import providers
from database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: Resolve API key from request headers or environment
# ---------------------------------------------------------------------------

def resolve_api_key(
    header_api_key: Optional[str],
    header_anthropic_key: Optional[str]
) -> Optional[str]:
    """Resolves API key from headers or server environment variables."""
    key = header_api_key or header_anthropic_key
    if not key:
        key = (
            os.getenv("AI_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("ANTHROPIC_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("GROQ_API_KEY")
        )
    if key and key != "sk-ant-your-actual-api-key-here":
        return key.strip()
    return None


# ---------------------------------------------------------------------------
# Authentication dependency (Self-healing mock for developmental mode)
# ---------------------------------------------------------------------------
def mock_get_current_user(db: Session = Depends(get_db)) -> schemas.UserOut:
    user = db.query(models.User).filter(models.User.id == 1).first()
    if not user:
        user = models.User(
            id=1,
            email="test@example.com",
            password_hash="mock_hash_for_development"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return schemas.UserOut(id=user.id, email=user.email, created_at=user.created_at)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/providers/detect", response_model=schemas.DetectProviderOut)
def detect_provider_endpoint(payload: schemas.DetectProviderIn):
    """Detects which AI company an API key belongs to."""
    detected = providers.detect_provider(payload.key)
    name = providers.get_provider_label(detected)
    return schemas.DetectProviderOut(provider=detected, name=name)


@router.post("/prompts/enhance", response_model=schemas.EnhancePromptOut)
def enhance_prompt(
    payload: schemas.EnhancePromptIn,
    x_api_key: Optional[str] = Header(None, description="Universal AI API Key"),
    x_anthropic_key: Optional[str] = Header(None, description="Anthropic API Key (backward compat)"),
    x_provider: Optional[str] = Header(None, description="Explicit provider name (optional)"),
    user: schemas.UserOut = Depends(mock_get_current_user),
):
    """
    Enhances a user prompt. Auto-detects company provider (Anthropic, OpenAI, Gemini, Groq, OpenRouter)
    if an API key is provided, or uses smart heuristic presets when no key is supplied.
    """
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    api_key = resolve_api_key(x_api_key, x_anthropic_key)
    enhanced_prompt = None
    engine_name = "Preset"
    error_detail = None
    chosen_provider = payload.provider or x_provider

    if api_key:
        enhanced_prompt, engine_name, error_detail = providers.enhance_with_provider(
            prompt=payload.prompt,
            key=api_key,
            style=payload.style,
            provider=chosen_provider,
        )

    if not enhanced_prompt:
        enhanced_prompt = providers.smart_enhance_prompt(payload.prompt, payload.style)
        if not api_key:
            engine_name = "Preset"

    return schemas.EnhancePromptOut(
        original_prompt=payload.prompt,
        enhanced_prompt=enhanced_prompt,
        engine=engine_name,
        provider=chosen_provider,
        error=error_detail,
    )


@router.post("/generations/create", response_model=schemas.GenerationOut)
def create_generation(
    request: schemas.GenerateImageRequest,
    x_api_key: Optional[str] = Header(None, description="Universal AI API Key"),
    x_anthropic_key: Optional[str] = Header(None, description="Anthropic API Key (backward compat)"),
    x_provider: Optional[str] = Header(None, description="Explicit provider name (optional)"),
    db: Session = Depends(get_db),
    user: schemas.UserOut = Depends(mock_get_current_user),
):
    """
    Generates an image from prompt:
    - If a Gemini key is inserted: Generates natively with Google Imagen 3 (imagen-3.0-generate-002)
    - If an OpenAI key is inserted: Generates natively with OpenAI DALL-E 3 (dall-e-3)
    - If an Anthropic key is inserted: Enhances with Claude 3.5 Sonnet + renders high-res FLUX
    - If a Groq key is inserted: Enhances with Groq Llama 3.3 + renders high-res FLUX
    - If no key is inserted: Uses default fast AI generation (free mode)
    """
    clean_prompt = request.prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    api_key = resolve_api_key(x_api_key, x_anthropic_key)
    chosen_provider = request.provider or x_provider

    # Generate image using provider's native model
    image_url, enhanced_prompt, engine_name, key_warning = providers.generate_image_with_provider(
        prompt=clean_prompt,
        key=api_key,
        aspect_ratio=request.aspect_ratio or "1:1",
        style=request.style,
        provider=chosen_provider,
    )

    try:
        # Store prompt and generation record
        db_prompt = models.Prompt(
            user_id=user.id,
            original_text=clean_prompt,
            enhanced_text=enhanced_prompt,
        )
        db.add(db_prompt)
        db.commit()
        db.refresh(db_prompt)

        db_generation = models.Generation(
            user_id=user.id,
            prompt_id=db_prompt.id,
            image_url=image_url,
            engine=engine_name,
        )
        db.add(db_generation)
        db.commit()
        db.refresh(db_generation)

        return schemas.GenerationOut(
            id=db_generation.id,
            prompt_id=db_prompt.id,
            image_url=image_url,
            original_prompt=clean_prompt,
            enhanced_prompt=enhanced_prompt,
            engine=engine_name,
            created_at=db_generation.created_at,
            is_favorite=False,
            key_warning=key_warning,
        )
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist generation to database: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to save generation record to the database."
        )


@router.get("/generations/history", response_model=schemas.PaginatedGenerationsOut)
def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    only_favorites: bool = Query(False),
    user: schemas.UserOut = Depends(mock_get_current_user),
    db: Session = Depends(get_db),
):
    """Returns user generation history. Supports pagination and favorites filtering."""
    offset = (page - 1) * limit

    query = (
        db.query(models.Generation)
        .options(
            joinedload(models.Generation.prompt),
            joinedload(models.Generation.favorited_by)
        )
        .filter(models.Generation.user_id == user.id)
    )

    if only_favorites:
        query = query.join(models.Favorite).filter(models.Favorite.user_id == user.id)

    total = query.count()
    generations = query.order_by(models.Generation.created_at.desc()).offset(offset).limit(limit).all()

    favorite_gen_ids = {
        fav.generation_id
        for fav in db.query(models.Favorite.generation_id)
        .filter(models.Favorite.user_id == user.id)
        .all()
    }

    items = [
        schemas.GenerationOut(
            id=gen.id,
            prompt_id=gen.prompt_id,
            image_url=gen.image_url,
            original_prompt=gen.prompt.original_text if gen.prompt else "Generated Image",
            enhanced_prompt=gen.prompt.enhanced_text if gen.prompt else None,
            engine=gen.engine or "Default",
            created_at=gen.created_at,
            is_favorite=(gen.id in favorite_gen_ids),
        )
        for gen in generations
    ]

    return schemas.PaginatedGenerationsOut(
        items=items,
        total=total,
        page=page,
        limit=limit,
        has_more=(offset + limit < total),
    )


@router.post("/generations/{generation_id}/favorite", response_model=schemas.FavoriteToggleOut)
def toggle_favorite(
    generation_id: int,
    user: schemas.UserOut = Depends(mock_get_current_user),
    db: Session = Depends(get_db),
):
    """Toggles favorite status for a given generation."""
    generation = db.query(models.Generation).filter(models.Generation.id == generation_id).first()
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found.")

    existing_fav = (
        db.query(models.Favorite)
        .filter(models.Favorite.user_id == user.id, models.Favorite.generation_id == generation_id)
        .first()
    )

    if existing_fav:
        db.delete(existing_fav)
        db.commit()
        return schemas.FavoriteToggleOut(generation_id=generation_id, is_favorite=False)
    else:
        new_fav = models.Favorite(user_id=user.id, generation_id=generation_id)
        db.add(new_fav)
        db.commit()
        return schemas.FavoriteToggleOut(generation_id=generation_id, is_favorite=True)


@router.delete("/generations/{generation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_generation(
    generation_id: int,
    user: schemas.UserOut = Depends(mock_get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes a generation from the user's gallery."""
    generation = (
        db.query(models.Generation)
        .filter(models.Generation.id == generation_id, models.Generation.user_id == user.id)
        .first()
    )
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found.")

    db.delete(generation)
    db.commit()
    return None


@router.get("/generations/stats", response_model=schemas.StatsOut)
def get_user_stats(
    user: schemas.UserOut = Depends(mock_get_current_user),
    db: Session = Depends(get_db),
):
    """Returns total generations and favorites count for the user."""
    total_generations = db.query(models.Generation).filter(models.Generation.user_id == user.id).count()
    total_favorites = db.query(models.Favorite).filter(models.Favorite.user_id == user.id).count()
    return schemas.StatsOut(
        total_generations=total_generations,
        total_favorites=total_favorites,
    )