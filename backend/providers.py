# backend/providers.py
import base64
import json
import logging
import os
import secrets
import urllib.request
import urllib.parse
import urllib.error
from typing import Optional, Tuple

import anthropic
import openai

logger = logging.getLogger(__name__)

# Ensure local generation storage directory exists
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "generations")
os.makedirs(STATIC_DIR, exist_ok=True)

SYSTEM_INSTRUCTION = (
    "You are an expert AI image prompt engineer. Transform the user's idea into a "
    "rich, detailed, comma-separated prompt optimized for high-quality image generation. "
    "Focus on subject details, textures, lighting, camera angle, and atmosphere. "
    "Output ONLY the final comma-separated prompt text — do not include quotes, intro, or explanations."
)

# Supported image dimensions for Pollinations.ai
ASPECT_RATIO_SIZES: dict[str, tuple[int, int]] = {
    "1:1":  (1024, 1024),
    "16:9": (1920, 1080),
    "9:16": (576,  1024),
    "4:3":  (1024, 768),
}

# Curated style presets
STYLE_MODIFIERS: dict[str, str] = {
    "Cinematic": "cinematic still, 35mm film grain, dramatic volumetric lighting, IMAX quality, cinematic color grading, master shot",
    "Photorealistic": "photorealistic portrait photography, 8k resolution, cinematic lighting, shallow depth of field, 50mm lens, sharp focus, award-winning photography",
    "Anime": "anime artwork, Makoto Shinkai aesthetic, vibrant expressive colors, detailed illustration, dynamic lighting, high quality anime visual",
    "Cyberpunk": "cyberpunk style, glowing neon reflections, futuristic tech atmosphere, high contrast shadows, cyan and magenta aesthetic, 8k",
    "Fantasy": "epic high-fantasy digital art, mythical atmosphere, magical volumetric glow, intricate details, trending on ArtStation, majestic lighting",
    "3D Render": "3D digital render, Octane Render, unreal engine 5, ray tracing, studio lighting, subsurface scattering, smooth clay textures, 4k",
    "Watercolor": "watercolor painting, soft fluid brushstrokes, pastel color palette, delicate ink splatters, artistic textured paper, masterpiece",
    "Minimalist": "minimalist art, clean geometry, negative space, elegant composition, modern aesthetic, muted harmonious palette",
}

def detect_provider(key: str) -> str:
    """
    Detects which company the key belongs to based on standard prefixes.
    Supports:
      - Anthropic: sk-ant-...
      - Google Gemini: AIzaSy..., AIza..., or AQ... (modern Google AI Studio developer keys)
      - Groq: gsk_...
      - OpenRouter: sk-or-v1-...
      - Stability AI: starts with 'sk-' and user selected stability, or st-...
      - OpenAI: sk-proj-..., sk-...
    Returns: 'anthropic', 'openai', 'gemini', 'groq', 'openrouter', or 'unknown'
    """
    clean = key.strip()
    if clean.startswith("sk-ant-"):
        return "anthropic"
    if clean.startswith("sk-or-v1-"):
        return "openrouter"
    if clean.startswith("gsk_"):
        return "groq"
    if clean.startswith("AIzaSy") or clean.startswith("AIza") or clean.startswith("AQ"):
        return "gemini"
    if clean.startswith("sk-proj-") or clean.startswith("sk-"):
        return "openai"
    return "unknown"

def get_provider_label(provider: str) -> str:
    labels = {
        "anthropic": "Anthropic (Claude Opus 5.5)",
        "openai": "OpenAI (DALL-E 3 / GPT-4o)",
        "gemini": "Google (Imagen 3 / Gemini 1.5)",
        "groq": "Groq (Llama 3.3 70B)",
        "openrouter": "OpenRouter",
        "unknown": "Auto / Custom Provider",
    }
    return labels.get(provider, "Custom Provider")

def describe_key_error(exc: Exception, provider_name: str, detail: Optional[str] = None) -> str:
    """Turns a provider API failure into a short, user-facing reason why the key can't be used."""
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    text = (detail or str(exc)).lower()

    is_network = isinstance(exc, (anthropic.APIConnectionError, openai.APIConnectionError)) or (
        isinstance(exc, urllib.error.URLError) and not isinstance(exc, urllib.error.HTTPError)
    )
    if is_network:
        reason = "could not be reached (network error or timeout)"
    elif status == 402 or any(s in text for s in ("credit balance", "insufficient_quota", "billing")):
        reason = "has run out of credits or tokens"
    elif status == 401 or "api key not valid" in text or "invalid x-api-key" in text:
        reason = "is invalid, expired or has been revoked"
    elif status == 403:
        reason = "does not have permission to use this model"
    elif status == 404:
        reason = "does not have access to the required model"
    elif status == 429:
        reason = "has hit its rate limit or usage quota"
    else:
        reason = f"returned an unexpected error ({status or type(exc).__name__})"
    return f"Your {provider_name} key {reason}."

def smart_enhance_prompt(prompt: str, style: Optional[str] = None) -> str:
    """Local prompt engineer when no external API key is used."""
    clean_prompt = prompt.strip().rstrip(",")
    style_text = STYLE_MODIFIERS.get(style or "", "")

    parts = [clean_prompt]
    if style_text:
        parts.append(style_text)
    else:
        parts.append("cinematic lighting, 8k resolution, highly detailed, sharp focus, masterpiece")

    return ", ".join(parts)

def build_pollinations_url(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Builds a high-res Pollinations.ai URL with dimensions and unique random seed."""
    w, h = ASPECT_RATIO_SIZES.get(aspect_ratio, (1024, 1024))
    encoded = urllib.parse.quote(prompt)
    seed = secrets.token_hex(4)
    return f"https://image.pollinations.ai/prompt/{encoded}?width={w}&height={h}&nologo=true&seed={seed}"

def save_image_bytes(image_data: bytes, prefix: str = "gen") -> str:
    """Saves raw image bytes to the backend static storage and returns permanent URL."""
    filename = f"{prefix}_{secrets.token_hex(6)}.jpg"
    filepath = os.path.join(STATIC_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(image_data)
    return f"http://localhost:8000/static/generations/{filename}"


# ---------------------------------------------------------------------------
# Text Enhancement with Detected Provider
# ---------------------------------------------------------------------------

def enhance_with_provider(
    prompt: str,
    key: str,
    style: Optional[str] = None,
    provider: Optional[str] = None,
) -> Tuple[Optional[str], str, Optional[str]]:
    """
    Enhances prompt text using the provider's LLM model.
    Returns: (enhanced_prompt, provider_display_name, error_detail)
    error_detail is a user-facing reason the key could not be used, or None on success.
    """
    clean_key = key.strip()
    if not clean_key or clean_key == "sk-ant-your-actual-api-key-here":
        return None, "Preset", None

    chosen_provider = provider or detect_provider(clean_key)
    style_instruction = f" The requested artistic style is: '{style}'." if style else ""
    full_system = f"{SYSTEM_INSTRUCTION}{style_instruction}"

    # 1. Anthropic (Claude)
    if chosen_provider == "anthropic":
        try:
            client = anthropic.Anthropic(api_key=clean_key, timeout=30.0, max_retries=1)
            res = client.beta.messages.create(
                model="claude-opus-5-5",
                max_tokens=2000,
                system=full_system,
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
            if res.stop_reason == "refusal":
                return None, "Anthropic (Failed)", "Claude declined to rewrite this prompt."
            # Thinking blocks may precede the answer, so pick the first text block
            text = next((b.text for b in res.content if b.type == "text"), "").strip()
            if not text:
                return None, "Anthropic (Failed)", "Claude returned an empty prompt."
            return text, "Anthropic Claude", None
        except anthropic.APIError as exc:
            logger.warning("Anthropic API failed: %s", exc)
            return None, "Anthropic (Failed)", describe_key_error(exc, "Anthropic")

    # 2. OpenAI
    elif chosen_provider == "openai":
        try:
            client = openai.OpenAI(api_key=clean_key, timeout=12.0)
            res = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=250,
                messages=[
                    {"role": "system", "content": full_system},
                    {"role": "user", "content": prompt},
                ],
            )
            return res.choices[0].message.content.strip(), "OpenAI GPT-4o", None
        except openai.APIError as exc:
            logger.warning("OpenAI API failed: %s", exc)
            return None, "OpenAI (Failed)", describe_key_error(exc, "OpenAI")

    # 3. Google Gemini (REST: supports AIza... and AQ... keys)
    elif chosen_provider == "gemini":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={clean_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"{full_system}\n\nUser prompt to enhance: {prompt}"}
                        ]
                    }
                ],
                "generationConfig": {"maxOutputTokens": 250},
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                data = json.loads(response.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"].strip(), "Google Gemini", None
                return None, "Google Gemini", "Google Gemini returned no prompt text."
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="ignore")
            logger.warning("Google Gemini HTTP error (%s): %s", exc.code, err_body)
            return None, "Google Gemini (Failed)", describe_key_error(exc, "Google Gemini", err_body)
        except Exception as exc:
            logger.warning("Google Gemini API failed: %s", exc)
            return None, "Google Gemini (Failed)", describe_key_error(exc, "Google Gemini")

    # 4. Groq
    elif chosen_provider == "groq":
        try:
            client = openai.OpenAI(
                api_key=clean_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=12.0,
            )
            res = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                max_tokens=250,
                messages=[
                    {"role": "system", "content": full_system},
                    {"role": "user", "content": prompt},
                ],
            )
            return res.choices[0].message.content.strip(), "Groq Llama 3.3", None
        except openai.APIError as exc:
            logger.warning("Groq API failed: %s", exc)
            return None, "Groq (Failed)", describe_key_error(exc, "Groq")

    return None, "Preset", "This key's provider is not supported yet."


# ---------------------------------------------------------------------------
# Native Image Generation with Detected Provider
# ---------------------------------------------------------------------------

FREE_ENGINE_NOTE = "The image was generated with the free engine instead."

def _free_generation(prompt: str, aspect_ratio: str, style: Optional[str], key_warning: Optional[str] = None) -> Tuple[str, str, str, Optional[str]]:
    enhanced_prompt = smart_enhance_prompt(prompt, style)
    poll_url = build_pollinations_url(enhanced_prompt, aspect_ratio)
    if key_warning:
        key_warning = f"{key_warning} {FREE_ENGINE_NOTE}"
    return poll_url, enhanced_prompt, "Fast AI Engine (Free)", key_warning

def generate_image_with_provider(
    prompt: str,
    key: Optional[str] = None,
    aspect_ratio: str = "1:1",
    style: Optional[str] = None,
    provider: Optional[str] = None,
) -> Tuple[str, str, str, Optional[str]]:
    """
    Generates an image using the company's native image generation API:
    - Google Gemini key: Generates via Google Imagen 3 (imagen-3.0-generate-002)
    - OpenAI key: Generates via OpenAI DALL-E 3 (dall-e-3)
    - Anthropic key: Enhances with Claude Opus 5.5 + renders with FLUX (Anthropic has no image API)
    - Groq key: Enhances with Groq Llama 3.3 + renders with FLUX
    - No key / unusable key: Uses smart style heuristics + renders with FLUX
    Returns: (image_url, enhanced_prompt, engine_name, key_warning)
    key_warning is a user-facing message when a key was supplied but could not be used.
    """
    clean_key = key.strip() if key else None
    chosen_provider = provider or (detect_provider(clean_key) if clean_key else None)

    if not clean_key:
        logger.info("Generating with Default Fast AI Engine (Free mode)...")
        return _free_generation(prompt, aspect_ratio, style)

    # ── 1. GOOGLE GEMINI: IMAGEN 3 ──────────────────────────────────────────
    if chosen_provider == "gemini":
        enhanced_prompt = smart_enhance_prompt(prompt, style)
        try:
            logger.info("Generating image with Google Imagen 3 (model: imagen-3.0-generate-002)...")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={clean_key}"

            # Map aspect ratio to Imagen 3 supported formats: 1:1, 16:9, 9:16, 4:3
            imagen_ar = aspect_ratio if aspect_ratio in ["1:1", "16:9", "9:16", "4:3"] else "1:1"
            payload = {
                "instances": [{"prompt": enhanced_prompt}],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": imagen_ar,
                    "outputOptions": {"mimeType": "image/jpeg"}
                }
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            predictions = data.get("predictions", [])
            if not predictions or "bytesBase64Encoded" not in predictions[0]:
                raise ValueError("Imagen returned no image")
            img_bytes = base64.b64decode(predictions[0]["bytesBase64Encoded"])
            saved_url = save_image_bytes(img_bytes, prefix="gemini_imagen")
            logger.info("Successfully generated image with Google Imagen 3! Saved to: %s", saved_url)
            return saved_url, enhanced_prompt, "Google Imagen 3", None
        except Exception as exc:
            body = exc.read().decode("utf-8", errors="ignore") if isinstance(exc, urllib.error.HTTPError) else None
            logger.warning("Google Imagen 3 API unavailable with this key (%s). Falling back...", body or exc)
            image_error = describe_key_error(exc, "Google", body)
            # Key may still have Gemini text access: enhance with Gemini & render with FLUX
            enhanced, _, text_error = enhance_with_provider(prompt, clean_key, style, provider="gemini")
            if not enhanced:
                return _free_generation(prompt, aspect_ratio, style, text_error or image_error)
            poll_url = build_pollinations_url(enhanced, aspect_ratio)
            warning = f"{image_error} Gemini improved your prompt, but the image was rendered with the free engine."
            return poll_url, enhanced, "Google Gemini + FLUX Engine", warning

    # ── 2. OPENAI: DALL-E 3 ──────────────────────────────────────────────────
    if chosen_provider == "openai":
        enhanced_prompt = smart_enhance_prompt(prompt, style)
        try:
            logger.info("Generating image with OpenAI DALL-E 3...")
            client = openai.OpenAI(api_key=clean_key, timeout=35.0)

            dalle_sizes = {
                "1:1": "1024x1024",
                "16:9": "1792x1024",
                "9:16": "1024x1792",
                "4:3": "1024x1024",
            }
            size = dalle_sizes.get(aspect_ratio, "1024x1024")

            res = client.images.generate(
                model="dall-e-3",
                prompt=enhanced_prompt,
                size=size,
                quality="standard",
                n=1,
            )
            temp_url = res.data[0].url
            revised_prompt = res.data[0].revised_prompt or enhanced_prompt

            # Download and permanently save the DALL-E image so the URL never expires
            with urllib.request.urlopen(temp_url, timeout=20) as img_resp:
                img_bytes = img_resp.read()
                saved_url = save_image_bytes(img_bytes, prefix="openai_dalle")
                logger.info("Successfully generated image with DALL-E 3! Saved to: %s", saved_url)
                return saved_url, revised_prompt, "OpenAI DALL-E 3", None
        except Exception as exc:
            logger.warning("OpenAI DALL-E 3 generation failed (%s). Falling back...", exc)
            image_error = describe_key_error(exc, "OpenAI")
            enhanced, _, text_error = enhance_with_provider(prompt, clean_key, style, provider="openai")
            if not enhanced:
                return _free_generation(prompt, aspect_ratio, style, text_error or image_error)
            poll_url = build_pollinations_url(enhanced, aspect_ratio)
            warning = f"{image_error} GPT-4o improved your prompt, but the image was rendered with the free engine."
            return poll_url, enhanced, "OpenAI GPT-4o + FLUX Engine", warning

    # ── 3. ANTHROPIC: CLAUDE OPUS 5.5 + HIGH-RES FLUX ──────────────────────
    if chosen_provider == "anthropic":
        logger.info("Enhancing with Claude Opus 5.5 and generating via FLUX...")
        enhanced, _, error = enhance_with_provider(prompt, clean_key, style, provider="anthropic")
        if not enhanced:
            return _free_generation(prompt, aspect_ratio, style, error)
        poll_url = build_pollinations_url(enhanced, aspect_ratio)
        return poll_url, enhanced, "Anthropic Claude + FLUX Engine", None

    # ── 4. GROQ: LLAMA 3.3 + HIGH-RES FLUX ─────────────────────────────────
    if chosen_provider == "groq":
        logger.info("Enhancing with Groq Llama 3.3 and generating via FLUX...")
        enhanced, _, error = enhance_with_provider(prompt, clean_key, style, provider="groq")
        if not enhanced:
            return _free_generation(prompt, aspect_ratio, style, error)
        poll_url = build_pollinations_url(enhanced, aspect_ratio)
        return poll_url, enhanced, "Groq Llama 3.3 + FLUX Engine", None

    # ── 5. UNRECOGNISED KEY ─────────────────────────────────────────────────
    logger.info("Unrecognised key format; generating with free engine...")
    return _free_generation(prompt, aspect_ratio, style, "Your API key format was not recognised.")
