# backend/providers.py
import base64
import json
import logging
import math
import os
import secrets
import threading
import time
import urllib.request
import urllib.parse
import urllib.error
from dataclasses import dataclass, replace
from typing import Optional, Tuple

import anthropic
import openai

logger = logging.getLogger(__name__)

# Ensure local generation storage directory exists
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "generations")
os.makedirs(STATIC_DIR, exist_ok=True)

# Text models used to enhance prompts (override in backend/.env when they are retired)
OPENAI_TEXT_MODEL = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")
GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.5-flash-lite")

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
        "openai": "OpenAI (GPT Image 2)",
        "gemini": "Google (Nano Banana 2 / Gemini)",
        "groq": "Groq (Llama 3.3 70B)",
        "openrouter": "OpenRouter",
        "unknown": "Auto / Custom Provider",
    }
    return labels.get(provider, "Custom Provider")

@dataclass(frozen=True)
class KeyIssue:
    """Why a user's API key could not be used. `code` is machine-readable so the frontend can
    show the reason in the user's language; `message` is the English description."""
    code: str
    provider: str
    message: str
    # What happened instead: "free" = free engine only, "partial" = the key improved the prompt
    # but the free engine drew the image
    fallback: str = "free"


def describe_key_error(exc: Exception, provider_name: str, detail: Optional[str] = None) -> KeyIssue:
    """Turns a provider API failure into a short, user-facing reason why the key can't be used."""
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    text = (detail or str(exc)).lower()

    is_network = isinstance(exc, (anthropic.APIConnectionError, openai.APIConnectionError)) or (
        isinstance(exc, urllib.error.URLError) and not isinstance(exc, urllib.error.HTTPError)
    )
    if is_network:
        code, reason = "network", "could not be reached (network error or timeout)"
    elif status == 402 or any(s in text for s in ("credit balance", "insufficient_quota", "billing",
                                                   "free allocation", "insufficient pollen", "not enough pollen")):
        code, reason = "no_credits", "has run out of credits or tokens"
    elif status == 401 or any(s in text for s in ("api key not valid", "invalid x-api-key", "invalid api key")):
        code, reason = "invalid_key", "is invalid, expired or has been revoked"
    elif status == 403:
        code, reason = "no_permission", "does not have permission to use this model"
    elif status == 404:
        code, reason = "no_model_access", "does not have access to the required model"
    elif status == 429:
        code, reason = "rate_limited", "has hit its rate limit or usage quota"
    else:
        code, reason = "unknown", f"returned an unexpected error ({status or type(exc).__name__})"
    return KeyIssue(code, provider_name, f"Your {provider_name} key {reason}.")

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

# Public address of this backend, used in URLs of saved images (set PUBLIC_BACKEND_URL when deploying)
STATIC_URL_PREFIX = os.getenv("PUBLIC_BACKEND_URL", "http://localhost:8000").rstrip("/") + "/static/generations/"

def delete_saved_image(image_url: str) -> None:
    """Removes an image file saved by save_image_bytes. URLs that point elsewhere
    (e.g. Pollinations) are ignored, and only files inside STATIC_DIR can be touched."""
    if not image_url or not image_url.startswith(STATIC_URL_PREFIX):
        return
    filename = os.path.basename(image_url[len(STATIC_URL_PREFIX):])
    path = os.path.join(STATIC_DIR, filename)
    if not filename or os.path.dirname(os.path.abspath(path)) != os.path.abspath(STATIC_DIR):
        return
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.warning("Could not delete saved image %s: %s", path, exc)

def save_image_bytes(image_data: bytes, prefix: str = "gen") -> str:
    """Saves raw image bytes to the backend static storage and returns permanent URL."""
    # 128 random bits: saved images are public by URL, so the name must be unguessable
    filename = f"{prefix}_{secrets.token_hex(16)}.jpg"
    filepath = os.path.join(STATIC_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(image_data)
    return f"{STATIC_URL_PREFIX}{filename}"


# ---------------------------------------------------------------------------
# Free engine (Pollinations): rendered server-side and saved locally
# ---------------------------------------------------------------------------
# Pollinations' free tier allows about one image every 45 seconds per IP. When it is over the
# limit it answers 402/429 with a placeholder "Free limit reached" image and a Retry-After
# header. Downloading here means we can detect that, never save a placeholder, and serve
# gallery images from our own server instead of re-rendering them on every view.

class FreeEngineBusy(Exception):
    """The free engine is rate limited; `retry_after` is the number of seconds to wait.
    `key_issue` is set when the free engine was only a fallback for a key that failed."""

    def __init__(self, retry_after: int):
        super().__init__(f"Free image engine is busy; try again in {retry_after} seconds")
        self.retry_after = retry_after
        self.key_issue: Optional["KeyIssue"] = None


class FreeEngineError(Exception):
    """The free engine failed for another reason (network error, unexpected response)."""

    key_issue: Optional["KeyIssue"] = None


GUEST_IMAGE_MAX_AGE = 24 * 60 * 60  # guest images aren't in any gallery, so they expire
FREE_ENGINE_INTERVAL = 45           # seconds between free images without a POLLINATIONS_TOKEN
_free_engine_ready_at = 0.0         # when Pollinations will accept requests again
_free_engine_lock = threading.Lock()


def _parse_retry_after(value: Optional[str]) -> int:
    try:
        return min(max(int(value), 1), 300)
    except (TypeError, ValueError):
        return 45


def _cleanup_guest_images() -> None:
    cutoff = time.time() - GUEST_IMAGE_MAX_AGE
    for name in os.listdir(STATIC_DIR):
        path = os.path.join(STATIC_DIR, name)
        if name.startswith("guest_") and os.path.getmtime(path) < cutoff:
            try:
                os.remove(path)
            except OSError:
                pass


def render_free_image(prompt: str, aspect_ratio: str = "1:1", guest: bool = False) -> str:
    """Renders `prompt` with the free engine, saves it locally and returns the saved URL.
    Raises FreeEngineBusy when rate limited and FreeEngineError on other failures."""
    global _free_engine_ready_at
    with _free_engine_lock:
        wait = math.ceil(_free_engine_ready_at - time.time())
    if wait > 0:
        # We already know it's busy: don't spend a request (or extend the penalty)
        raise FreeEngineBusy(wait)

    token = os.getenv("POLLINATIONS_TOKEN", "").strip()
    if token:
        # With a server-wide Pollinations key, use the keyed API and a much better model
        try:
            data = _fetch_pollinations_gen(prompt, token, aspect_ratio, POLLINATIONS_DEFAULT_MODEL)
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise FreeEngineBusy(_parse_retry_after(exc.headers.get("Retry-After"))) from exc
            raise FreeEngineError(f"Pollinations returned HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise FreeEngineError(f"Could not reach Pollinations: {exc}") from exc
        if guest:
            _cleanup_guest_images()
        return save_image_bytes(data, prefix="guest" if guest else "free")

    # No "Accept: image/*": with it, Pollinations sometimes holds an over-limit request for the
    # rest of the window instead of refusing it, which would leave the user waiting
    headers = {"User-Agent": "PicApp/1.0"}
    request = urllib.request.Request(build_pollinations_url(prompt, aspect_ratio), headers=headers)

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            content_type = response.headers.get("Content-Type", "")
            data = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (402, 429):
            retry_after = _parse_retry_after(exc.headers.get("Retry-After"))
            with _free_engine_lock:
                _free_engine_ready_at = time.time() + retry_after
            logger.info("Free image engine rate limited for %ss", retry_after)
            raise FreeEngineBusy(retry_after) from exc
        if exc.code == 503:
            # "The Classic API is at its limit right now. Retry after 10s"
            raise FreeEngineBusy(_parse_retry_after(exc.headers.get("Retry-After")) if exc.headers.get("Retry-After") else 10) from exc
        raise FreeEngineError(f"Pollinations returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FreeEngineError(f"Could not reach Pollinations: {exc}") from exc

    if not content_type.startswith("image/") or not data:
        raise FreeEngineError(f"Pollinations returned {content_type or 'no content'} instead of an image")

    # The free tier allows one image per window, so the next request is known to fail;
    # answer it from memory instead of asking (and possibly being held by) Pollinations
    with _free_engine_lock:
        _free_engine_ready_at = time.time() + FREE_ENGINE_INTERVAL

    if guest:
        _cleanup_guest_images()
    return save_image_bytes(data, prefix="guest" if guest else "free")


# ---------------------------------------------------------------------------
# Text Enhancement with Detected Provider
# ---------------------------------------------------------------------------

def enhance_with_provider(
    prompt: str,
    key: str,
    style: Optional[str] = None,
    provider: Optional[str] = None,
) -> Tuple[Optional[str], str, Optional[KeyIssue]]:
    """
    Enhances prompt text using the provider's LLM model.
    Returns: (enhanced_prompt, provider_display_name, error_detail)
    error_detail is a KeyIssue describing why the key could not be used, or None on success.
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
                return None, "Anthropic (Failed)", KeyIssue("refused", "Anthropic", "Claude declined to rewrite this prompt.")
            # Thinking blocks may precede the answer, so pick the first text block
            text = next((b.text for b in res.content if b.type == "text"), "").strip()
            if not text:
                return None, "Anthropic (Failed)", KeyIssue("empty_response", "Anthropic", "Claude returned an empty prompt.")
            return text, "Anthropic Claude", None
        except anthropic.APIError as exc:
            logger.warning("Anthropic API failed: %s", exc)
            return None, "Anthropic (Failed)", describe_key_error(exc, "Anthropic")

    # 2. OpenAI
    elif chosen_provider == "openai":
        try:
            client = openai.OpenAI(api_key=clean_key, timeout=12.0)
            res = client.chat.completions.create(
                model=OPENAI_TEXT_MODEL,
                max_tokens=250,
                messages=[
                    {"role": "system", "content": full_system},
                    {"role": "user", "content": prompt},
                ],
            )
            return res.choices[0].message.content.strip(), "OpenAI GPT", None
        except openai.APIError as exc:
            logger.warning("OpenAI API failed: %s", exc)
            return None, "OpenAI (Failed)", describe_key_error(exc, "OpenAI")

    # 3. Google Gemini (REST: supports AIza... and AQ... keys)
    elif chosen_provider == "gemini":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TEXT_MODEL}:generateContent?key={clean_key}"
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
                return None, "Google Gemini", KeyIssue("empty_response", "Google Gemini", "Google Gemini returned no prompt text.")
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

    return None, "Preset", KeyIssue("unsupported_provider", "", "This key's provider is not supported yet.")


# ---------------------------------------------------------------------------
# Image engines
# ---------------------------------------------------------------------------
# The user picks an engine in the Studio. Paid engines use the user's own key for that
# provider; if it can't be used, the free engine draws the image and the user is told why.
# Model IDs can be overridden in backend/.env when providers release new versions.

OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
GEMINI_PRO_IMAGE_MODEL = os.getenv("GEMINI_PRO_IMAGE_MODEL", "gemini-3-pro-image")
FLUX_MODEL = os.getenv("FLUX_MODEL", "flux-2-pro-preview")
CLOUDFLARE_IMAGE_MODEL = os.getenv("CLOUDFLARE_IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell")
POLLINATIONS_DEFAULT_MODEL = os.getenv("POLLINATIONS_DEFAULT_MODEL", "black-forest-labs/flux.2-klein-4b")

# Models that a free Pollinations account can pay for with its free (quest) pollen
POLLINATIONS_MODELS = {
    "pollinations-klein": "black-forest-labs/flux.2-klein-4b",
    "pollinations-zimage": "tongyi-mai/z-image-turbo",
    "pollinations-schnell": "black-forest-labs/flux.1-schnell",
    "pollinations-gptmini": "openai/gpt-image-1-mini",
}

FREE_ENGINE = "free"


@dataclass(frozen=True)
class ImageEngine:
    id: str
    label: str          # shown as "Generated with …"
    provider: str       # provider name used in key-issue messages
    key_provider: str   # which of the user's keys it needs (matches the frontend's key store)


IMAGE_ENGINES: dict[str, ImageEngine] = {
    "openai": ImageEngine("openai", "OpenAI GPT Image 2", "OpenAI", "openai"),
    "gemini": ImageEngine("gemini", "Google Nano Banana 2", "Google", "google"),
    "gemini-pro": ImageEngine("gemini-pro", "Google Nano Banana Pro", "Google", "google"),
    "flux": ImageEngine("flux", "FLUX.2 Pro (Black Forest Labs)", "Black Forest Labs", "bfl"),
    # Free with the user's own free account
    "pollinations-klein": ImageEngine("pollinations-klein", "FLUX.2 klein (Pollinations)", "Pollinations", "pollinations"),
    "pollinations-zimage": ImageEngine("pollinations-zimage", "Z-Image Turbo (Pollinations)", "Pollinations", "pollinations"),
    "pollinations-schnell": ImageEngine("pollinations-schnell", "FLUX.1 schnell (Pollinations)", "Pollinations", "pollinations"),
    "pollinations-gptmini": ImageEngine("pollinations-gptmini", "GPT Image 1 mini (Pollinations)", "Pollinations", "pollinations"),
    "cloudflare-schnell": ImageEngine("cloudflare-schnell", "FLUX.1 schnell (Cloudflare)", "Cloudflare", "cloudflare"),
}

# Output sizes per aspect ratio for each engine's accepted values
OPENAI_SIZES = {"1:1": "1024x1024", "16:9": "1536x1024", "4:3": "1536x1024", "9:16": "1024x1536"}
FLUX_SIZES = {"1:1": (1024, 1024), "16:9": (1344, 768), "4:3": (1152, 864), "9:16": (768, 1344)}

FREE_ENGINE_NOTE = "The image was generated with the free engine instead."


class _EngineFailure(Exception):
    """A paid engine couldn't produce an image; carries the reason for the user."""

    def __init__(self, issue: KeyIssue):
        super().__init__(issue.message)
        self.issue = issue


def _http_failure(exc: urllib.error.HTTPError, provider: str) -> _EngineFailure:
    body = exc.read().decode("utf-8", errors="ignore")
    logger.warning("%s image API error (%s): %s", provider, exc.code, body[:500])
    return _EngineFailure(describe_key_error(exc, provider, body))


def _post_json(url: str, payload: dict, headers: dict, timeout: float) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _render_openai(prompt: str, key: str, aspect_ratio: str) -> bytes:
    try:
        client = openai.OpenAI(api_key=key, timeout=120.0, max_retries=1)
        res = client.images.generate(
            model=OPENAI_IMAGE_MODEL,
            prompt=prompt,
            size=OPENAI_SIZES.get(aspect_ratio, "1024x1024"),
            quality="medium",
            output_format="jpeg",
            n=1,
        )
    except openai.APIError as exc:
        logger.warning("OpenAI image generation failed: %s", exc)
        raise _EngineFailure(describe_key_error(exc, "OpenAI"))
    item = res.data[0]
    if getattr(item, "b64_json", None):
        return base64.b64decode(item.b64_json)
    if getattr(item, "url", None):
        with urllib.request.urlopen(item.url, timeout=60) as img:
            return img.read()
    raise _EngineFailure(KeyIssue("empty_response", "OpenAI", "OpenAI returned no image."))


def _find_image_data(node) -> Optional[str]:
    """Finds the base64 image in a Gemini response, whichever shape the API returns
    (Interactions `type: image` blocks or generateContent `inlineData`)."""
    if isinstance(node, dict):
        if isinstance(node.get("data"), str) and (
            node.get("type") == "image" or "mime_type" in node or "mimeType" in node
        ):
            return node["data"]
        for key in ("inlineData", "inline_data"):
            if isinstance(node.get(key), dict) and isinstance(node[key].get("data"), str):
                return node[key]["data"]
        children = node.values()
    elif isinstance(node, list):
        children = node
    else:
        return None
    for child in children:
        found = _find_image_data(child)
        if found:
            return found
    return None


def _render_gemini(prompt: str, key: str, aspect_ratio: str, model: str) -> bytes:
    try:
        data = _post_json(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
                "model": model,
                "input": prompt,
                "response_format": {
                    "type": "image",
                    "mime_type": "image/jpeg",
                    "aspect_ratio": aspect_ratio if aspect_ratio in OPENAI_SIZES else "1:1",
                    "image_size": "1K",
                },
            },
            {"x-goog-api-key": key},
            timeout=120,
        )
    except urllib.error.HTTPError as exc:
        raise _http_failure(exc, "Google")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise _EngineFailure(describe_key_error(exc, "Google"))
    image = _find_image_data(data)
    if not image:
        logger.warning("Google returned no image: %s", json.dumps(data)[:500])
        raise _EngineFailure(KeyIssue("empty_response", "Google", "Google returned no image."))
    return base64.b64decode(image)


def _render_flux(prompt: str, key: str, aspect_ratio: str) -> bytes:
    width, height = FLUX_SIZES.get(aspect_ratio, (1024, 1024))
    headers = {"x-key": key}
    try:
        task = _post_json(f"https://api.bfl.ai/v1/{FLUX_MODEL}",
                          {"prompt": prompt, "width": width, "height": height}, headers, timeout=30)
        polling_url = task["polling_url"]
        # Generation is asynchronous: poll the URL BFL gives us until the image is ready
        deadline = time.time() + 120
        while time.time() < deadline:
            time.sleep(1)
            request = urllib.request.Request(polling_url, headers={"Accept": "application/json", **headers})
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
            status = result.get("status")
            if status == "Ready":
                # The result URL is signed and expires after 10 minutes: download it now
                with urllib.request.urlopen(result["result"]["sample"], timeout=60) as img:
                    return img.read()
            if status in ("Error", "Failed", "Content Moderated", "Request Moderated"):
                code = "refused" if "Moderated" in status else "unknown"
                raise _EngineFailure(KeyIssue(code, "Black Forest Labs", f"FLUX returned status {status}."))
        raise _EngineFailure(KeyIssue("network", "Black Forest Labs", "FLUX took too long to respond."))
    except urllib.error.HTTPError as exc:
        raise _http_failure(exc, "Black Forest Labs")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise _EngineFailure(describe_key_error(exc, "Black Forest Labs"))
    except (KeyError, TypeError, ValueError) as exc:
        raise _EngineFailure(KeyIssue("unknown", "Black Forest Labs", f"Unexpected FLUX response ({exc})."))


def _fetch_pollinations_gen(prompt: str, key: str, aspect_ratio: str, model: str) -> bytes:
    """One image from Pollinations' keyed API (raises urllib errors for the caller to map)."""
    width, height = FLUX_SIZES.get(aspect_ratio, (1024, 1024))
    query = urllib.parse.urlencode({"model": model, "width": width, "height": height, "seed": -1})
    request = urllib.request.Request(
        f"https://gen.pollinations.ai/image/{urllib.parse.quote(prompt)}?{query}",
        headers={"Authorization": f"Bearer {key}", "User-Agent": "PicApp/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        content_type = response.headers.get("Content-Type", "")
        data = response.read()
    if not content_type.startswith("image/") or not data:
        raise ValueError(f"Pollinations returned {content_type or 'no content'} instead of an image")
    return data


def _render_pollinations_account(prompt: str, key: str, aspect_ratio: str, model: str) -> bytes:
    try:
        return _fetch_pollinations_gen(prompt, key, aspect_ratio, model)
    except urllib.error.HTTPError as exc:
        raise _http_failure(exc, "Pollinations")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise _EngineFailure(describe_key_error(exc, "Pollinations"))
    except ValueError as exc:
        raise _EngineFailure(KeyIssue("empty_response", "Pollinations", str(exc)))


def _render_cloudflare(prompt: str, key: str) -> bytes:
    """Workers AI. The stored key is "ACCOUNT_ID:API_TOKEN"; FLUX.1 schnell output is square."""
    account_id, _, token = key.partition(":")
    if not account_id or not token:
        raise _EngineFailure(KeyIssue("invalid_key", "Cloudflare", "The Cloudflare key must be ACCOUNT_ID:API_TOKEN."))
    try:
        data = _post_json(
            f"https://api.cloudflare.com/client/v4/accounts/{urllib.parse.quote(account_id.strip())}/ai/run/{CLOUDFLARE_IMAGE_MODEL}",
            # 6 of the maximum 8 steps: noticeably sharper than the default 4, still cheap on the free allowance
            {"prompt": prompt[:2048], "steps": 6, "seed": secrets.randbelow(2**31)},
            {"Authorization": f"Bearer {token.strip()}"},
            timeout=120,
        )
    except urllib.error.HTTPError as exc:
        raise _http_failure(exc, "Cloudflare")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise _EngineFailure(describe_key_error(exc, "Cloudflare"))
    image = (data.get("result") or {}).get("image")
    if not data.get("success", True) or not image:
        logger.warning("Cloudflare returned no image: %s", json.dumps(data)[:500])
        raise _EngineFailure(KeyIssue("empty_response", "Cloudflare", "Cloudflare returned no image."))
    return base64.b64decode(image)


def _render_paid(engine: ImageEngine, prompt: str, key: str, aspect_ratio: str) -> str:
    """Renders with a paid engine and saves the image locally; returns the saved URL."""
    logger.info("Generating image with %s...", engine.label)
    if engine.id == "openai":
        data = _render_openai(prompt, key, aspect_ratio)
    elif engine.id == "gemini":
        data = _render_gemini(prompt, key, aspect_ratio, GEMINI_IMAGE_MODEL)
    elif engine.id == "gemini-pro":
        data = _render_gemini(prompt, key, aspect_ratio, GEMINI_PRO_IMAGE_MODEL)
    elif engine.id in POLLINATIONS_MODELS:
        data = _render_pollinations_account(prompt, key, aspect_ratio, POLLINATIONS_MODELS[engine.id])
    elif engine.id == "cloudflare-schnell":
        data = _render_cloudflare(prompt, key)
    else:
        data = _render_flux(prompt, key, aspect_ratio)
    return save_image_bytes(data, prefix=engine.id.replace("-", ""))


def generate_image(
    prompt: str,
    engine: str = FREE_ENGINE,
    image_key: Optional[str] = None,
    enhancer_key: Optional[str] = None,
    enhancer_provider: Optional[str] = None,
    aspect_ratio: str = "1:1",
    style: Optional[str] = None,
    guest: bool = False,
) -> Tuple[str, str, str, Optional[KeyIssue]]:
    """
    Generates an image with the chosen engine:
    - "free": Pollinations. If an enhancer key is given (Anthropic/OpenAI/Google/Groq), that
      provider first rewrites the prompt.
    - "openai" / "gemini" / "gemini-pro" / "flux": the provider's own image model, using
      `image_key` (paid by the user).
    - "pollinations-*" / "cloudflare-schnell": free models on the user's own free account. These models understand prompts well, so the prompt (plus the chosen style)
      is sent as-is; the Studio's "Enhance Prompt" button is still available beforehand.
    If a paid engine can't be used, the free engine draws the image instead.
    Returns: (image_url, final_prompt, engine_label, key_issue). Images are saved locally.
    Raises FreeEngineBusy / FreeEngineError when the free engine can't render.
    """
    styled_prompt = smart_enhance_prompt(prompt, style)
    issue: Optional[KeyIssue] = None

    paid = IMAGE_ENGINES.get(engine)
    if paid:
        key = (image_key or "").strip()
        if not key:
            issue = KeyIssue("missing_key", paid.provider, f"No {paid.provider} key is connected.")
        else:
            try:
                return _render_paid(paid, styled_prompt, key, aspect_ratio), styled_prompt, paid.label, None
            except _EngineFailure as failure:
                issue = failure.issue

    # Free engine (chosen, or fallback after a paid engine failed)
    final_prompt, label = styled_prompt, "Pollinations (Free)"
    if enhancer_key and enhancer_key.strip():
        enhanced, enhancer_name, enhance_issue = enhance_with_provider(prompt, enhancer_key, style, enhancer_provider)
        if enhanced:
            final_prompt, label = enhanced, f"{enhancer_name} + Pollinations"
        elif issue is None:
            issue = enhance_issue

    try:
        image_url = render_free_image(final_prompt, aspect_ratio, guest)
    except (FreeEngineBusy, FreeEngineError) as exc:
        # Keep the reason the chosen engine failed, so the user learns about both problems
        exc.key_issue = issue
        raise
    if issue:
        issue = replace(issue, message=f"{issue.message} {FREE_ENGINE_NOTE}", fallback="free")
    return image_url, final_prompt, label, issue
