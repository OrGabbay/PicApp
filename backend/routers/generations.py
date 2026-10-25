# backend/routers/generations.py
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

import models
import schemas
import providers
from auth import get_current_user, get_optional_user
from database import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper: Resolve API key from request headers or environment
# ---------------------------------------------------------------------------

def resolve_api_key(
    user: Optional[models.User],
    header_api_key: Optional[str],
    header_anthropic_key: Optional[str]
) -> Optional[str]:
    """Resolves API key from headers or server environment variables.
    API keys are a logged-in feature: guests always get the free engine."""
    if user is None:
        return None
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


def key_issue_fields(issue: Optional[providers.KeyIssue]) -> dict:
    """Maps a KeyIssue onto the GenerationOut key_warning* fields."""
    if issue is None:
        return {}
    return {
        "key_warning": issue.message,
        "key_warning_code": issue.code,
        "key_warning_provider": issue.provider or None,
        "key_warning_fallback": issue.fallback,
    }


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
    user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Enhances a user prompt. Auto-detects company provider (Anthropic, OpenAI, Gemini, Groq, OpenRouter)
    if an API key is provided, or uses smart heuristic presets when no key is supplied.
    """
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    api_key = resolve_api_key(user, x_api_key, x_anthropic_key)
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
        error=error_detail.message if error_detail else None,
        error_code=error_detail.code if error_detail else None,
        error_provider=(error_detail.provider or None) if error_detail else None,
    )


@router.post("/generations/create", response_model=schemas.GenerationOut)
def create_generation(
    request: schemas.GenerateImageRequest,
    x_api_key: Optional[str] = Header(None, description="Universal AI API Key"),
    x_anthropic_key: Optional[str] = Header(None, description="Anthropic API Key (backward compat)"),
    x_provider: Optional[str] = Header(None, description="Explicit provider name (optional)"),
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_optional_user),
):
    """
    Generates an image from prompt. The result is saved to the gallery only for logged-in
    users; guests get the image back with saved=False.
    - If a Gemini key is inserted: Generates natively with Google Imagen 3 (imagen-3.0-generate-002)
    - If an OpenAI key is inserted: Generates natively with OpenAI DALL-E 3 (dall-e-3)
    - If an Anthropic key is inserted: Enhances with Claude 3.5 Sonnet + renders high-res FLUX
    - If a Groq key is inserted: Enhances with Groq Llama 3.3 + renders high-res FLUX
    - If no key is inserted: Uses default fast AI generation (free mode)
    """
    clean_prompt = request.prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    api_key = resolve_api_key(user, x_api_key, x_anthropic_key)
    chosen_provider = request.provider or x_provider

    # Generate image using provider's native model
    image_url, enhanced_prompt, engine_name, key_issue = providers.generate_image_with_provider(
        prompt=clean_prompt,
        key=api_key,
        aspect_ratio=request.aspect_ratio or "1:1",
        style=request.style,
        provider=chosen_provider,
    )

    if user is None:
        return schemas.GenerationOut(
            image_url=image_url,
            original_prompt=clean_prompt,
            enhanced_prompt=enhanced_prompt,
            engine=engine_name,
            created_at=datetime.now(timezone.utc),
            saved=False,
            **key_issue_fields(key_issue),
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
            **key_issue_fields(key_issue),
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
    sort: str = Query("newest", pattern="^(newest|oldest)$"),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns user generation history. Supports pagination, favorites filtering and sorting."""
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
    order = models.Generation.created_at.asc() if sort == "oldest" else models.Generation.created_at.desc()
    generations = query.order_by(order, models.Generation.id).offset(offset).limit(limit).all()

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
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggles favorite status for a given generation."""
    generation = (
        db.query(models.Generation)
        .filter(models.Generation.id == generation_id, models.Generation.user_id == user.id)
        .first()
    )
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


def _delete_generation(db: Session, generation: models.Generation) -> str:
    """Deletes a generation (without committing) and returns its image URL for file cleanup."""
    image_url = generation.image_url
    # Each generation gets its own prompt row; delete the prompt with its last generation
    # (the cascade removes the generation) so no orphaned prompts are left behind
    prompt = generation.prompt
    if prompt is not None and len(prompt.generations) == 1:
        db.delete(prompt)
    else:
        db.delete(generation)
    return image_url


@router.delete("/generations/{generation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_generation(
    generation_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes one of the user's generations."""
    generation = (
        db.query(models.Generation)
        .filter(models.Generation.id == generation_id, models.Generation.user_id == user.id)
        .first()
    )
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found.")

    image_url = _delete_generation(db, generation)
    db.commit()
    # Remove the saved file only once the database change succeeded
    providers.delete_saved_image(image_url)
    return None


@router.post("/generations/delete", response_model=schemas.BulkDeleteOut)
def delete_generations(
    payload: schemas.BulkDeleteIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deletes several of the user's generations at once. IDs that don't exist or belong to
    another user are skipped; the response says how many were deleted."""
    generations = (
        db.query(models.Generation)
        .filter(models.Generation.id.in_(set(payload.ids)), models.Generation.user_id == user.id)
        .all()
    )
    image_urls = [_delete_generation(db, generation) for generation in generations]
    db.commit()
    for image_url in image_urls:
        providers.delete_saved_image(image_url)
    return schemas.BulkDeleteOut(deleted=len(image_urls))


@router.get("/generations/stats", response_model=schemas.StatsOut)
def get_user_stats(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns total generations and favorites count for the user."""
    total_generations = db.query(models.Generation).filter(models.Generation.user_id == user.id).count()
    total_favorites = db.query(models.Favorite).filter(models.Favorite.user_id == user.id).count()
    return schemas.StatsOut(
        total_generations=total_generations,
        total_favorites=total_favorites,
    )