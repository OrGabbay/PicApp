# backend/routers/generations.py
from fastapi import APIRouter, Depends, HTTPException, status
import schemas
from anthropic import Anthropic
import os

router = APIRouter()
anthropic_client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Mock authentication dependency: 
# This allows you to build your logic and extract a user_id without 
# waiting for Partner A to finish the real JWT auth system.
def mock_get_current_user():
    return schemas.UserOut(id=1, email="test@example.com", created_at="2026-10-13T19:00:00Z")

@router.post("/prompts/enhance", response_model=schemas.EnhancePromptOut)
def enhance_prompt(payload: schemas.EnhancePromptIn, user: schemas.UserOut = Depends(mock_get_current_user)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    # Temporary fallback while waiting for the real key
    if not api_key or api_key == "sk-ant-your-actual-api-key-here":
        return schemas.EnhancePromptOut(
            original_prompt=payload.prompt,
            enhanced_prompt=f"{payload.prompt}, cinematic lighting, 8k resolution, highly detailed, photorealistic masterpiece"
        )
        
    try:
        # Pass the user's prompt to Claude for enhancement
        response = anthropic_client.messages.create(
            model="claude-sonnet-4-6", #[cite: 1]
            max_tokens=256, #
            system="You are an expert prompt engineer. Expand the user's simple idea into a rich, detailed, comma-separated prompt optimized for high-quality image generation. Return ONLY the enhanced prompt text.",
            messages=[{"role": "user", "content": payload.prompt}]
        )
        return schemas.EnhancePromptOut(
            original_prompt=payload.prompt,
            enhanced_prompt=response.content[0].text.strip()
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API Error: {str(e)}")

@router.post("/generations", response_model=schemas.GenerationOut, status_code=status.HTTP_201_CREATED)
def create_generation(payload: schemas.GenerationCreate, user: schemas.UserOut = Depends(mock_get_current_user)):
    # 1. Trigger the image generation.
    # 2. Use SQLAlchemy to save the prompt and the resulting image_url to the database.
    # 3. Return the GenerationOut schema data.
    pass
    
@router.get("/generations/history", response_model=schemas.PaginatedGenerationsOut)
def get_history(page: int = 1, limit: int = 20, user: schemas.UserOut = Depends(mock_get_current_user), db: Session = Depends(get_db)):
    # Fetch paginated user generation history from the database[cite: 4]
    offset = (page - 1) * limit
    
    # Query the generations, ordered newest first
    generations = db.query(models.Generation)\
        .filter(models.Generation.user_id == user.id)\
        .order_by(models.Generation.created_at.desc())\
        .offset(offset).limit(limit).all()
        
    total = db.query(models.Generation).filter(models.Generation.user_id == user.id).count()
    
    # Format the data to match the Pydantic schema
    items = []
    for gen in generations:
        items.append({
            "id": gen.id,
            "prompt_id": gen.prompt_id,
            "image_url": gen.image_url,
            "original_prompt": gen.prompt.original_text,
            "enhanced_prompt": gen.prompt.enhanced_text,
            "created_at": gen.created_at,
            "is_favorite": False
        })
        
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": offset + limit < total
    }