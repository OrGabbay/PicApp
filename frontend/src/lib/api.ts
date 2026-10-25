// frontend/src/lib/api.ts
import type {
  EnhancePromptRequest,
  EnhancePromptResponse,
  CreateGenerationRequest,
  GenerationItem,
  PaginatedGenerations,
  FavoriteToggleResponse,
  UserStats,
  DetectProviderResponse,
  CurrentUser,
} from "@/src/types/api";
import { clearAllKeys, getStoredKeys, resolveEnhancer, type KeyProvider } from "@/src/lib/keys";
import { getEngine } from "@/src/lib/engines";

/** All backend calls go through the Next.js proxy, which attaches the login cookie's token. */
const API_BASE = "/api/backend";

/** Thrown when an endpoint needs a logged-in user (backend answered 401). */
export class AuthRequiredError extends Error {
  constructor() {
    super("Please log in to continue.");
    this.name = "AuthRequiredError";
  }
}

/** Why the chosen engine's key failed, when the free engine was only a fallback. */
export interface KeyIssueInfo {
  code?: string | null;
  provider?: string | null;
  message?: string | null;
}

/** The free image engine is rate limited; it accepts a new image after `retryAfter` seconds. */
export class EngineBusyError extends Error {
  constructor(public retryAfter: number, public keyIssue: KeyIssueInfo | null = null) {
    super("The free image engine is busy.");
    this.name = "EngineBusyError";
  }
}

/** The free image engine failed (network error, outage). */
export class EngineUnavailableError extends Error {
  constructor(public keyIssue: KeyIssueInfo | null = null) {
    super("The free image engine is unavailable right now.");
    this.name = "EngineUnavailableError";
  }
}

/** Remove every stored AI key (called on logout so keys don't outlive the session). */
export function clearStoredApiKey(): void {
  clearAllKeys();
}

// The backend calls Google "gemini"
const BACKEND_PROVIDER_NAMES: Record<KeyProvider, string> = {
  openai: "openai",
  google: "gemini",
  anthropic: "anthropic",
  groq: "groq",
  bfl: "bfl",
  pollinations: "pollinations",
  cloudflare: "cloudflare",
};

/** Headers carrying the key that enhances prompts (or nothing if none is connected). */
function enhancerHeaders(provider?: KeyProvider): Record<string, string> {
  const stored = getStoredKeys();
  const enhancer = provider
    ? stored.keys[provider] ? { provider, key: stored.keys[provider]! } : null
    : resolveEnhancer(stored);
  return enhancer ? { "x-api-key": enhancer.key, "x-provider": BACKEND_PROVIDER_NAMES[enhancer.provider] } : {};
}

/** Returns the logged-in user, or null for guests. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`, { cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to check login status");
  return res.json();
}

/** Clears the login cookie. */
export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

/**
 * Detect the AI company/provider from a key string.
 */
export async function detectProvider(key: string): Promise<DetectProviderResponse> {
  const res = await fetch(`${API_BASE}/api/v1/providers/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    return { provider: "unknown", name: "Custom Provider" };
  }
  return res.json();
}

/**
 * Enhance a user prompt using the configured AI key (auto-detected provider)
 * or fallback preset when no key is supplied.
 */
export async function enhancePrompt(
  payload: EnhancePromptRequest,
  /** Test a specific provider's key instead of the configured enhancer */
  useProvider?: KeyProvider
): Promise<EnhancePromptResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...enhancerHeaders(useProvider),
  };

  const res = await fetch(`${API_BASE}/api/v1/prompts/enhance`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Failed to enhance prompt");
  }
  return res.json();
}

/**
 * Generate an image from prompt and configuration.
 * Automatically uses the active AI key if available, or current default method if no key.
 */
export async function createGeneration(
  payload: CreateGenerationRequest
): Promise<GenerationItem> {
  const engine = getEngine(payload.engine ?? "free");
  const imageKey = engine.provider ? getStoredKeys().keys[engine.provider] : undefined;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // The enhancer key only matters for the free engine (it rewrites the prompt first)
    ...(engine.provider ? {} : enhancerHeaders()),
    ...(imageKey ? { "x-image-key": imageKey } : {}),
  };

  const res = await fetch(`${API_BASE}/api/v1/generations/create`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      detail?:
        | string
        | {
            code?: string;
            retry_after?: number;
            key_warning?: string;
            key_warning_code?: string;
            key_warning_provider?: string;
          };
    };
    const detail = err.detail;
    const keyIssue =
      typeof detail === "object" && detail?.key_warning_code
        ? { code: detail.key_warning_code, provider: detail.key_warning_provider, message: detail.key_warning }
        : null;
    if (typeof detail === "object" && detail?.code === "engine_busy") {
      throw new EngineBusyError(detail.retry_after ?? 45, keyIssue);
    }
    if (typeof detail === "object" && detail?.code === "engine_unavailable") {
      throw new EngineUnavailableError(keyIssue);
    }
    throw new Error(typeof detail === "string" ? detail : "Failed to generate image");
  }
  return res.json();
}

/**
 * Fetch paginated image generation history.
 */
export async function getGenerationHistory(
  page = 1,
  limit = 20,
  onlyFavorites = false,
  sort: "newest" | "oldest" = "newest"
): Promise<PaginatedGenerations> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort,
  });
  if (onlyFavorites) {
    params.set("only_favorites", "true");
  }

  const res = await fetch(`${API_BASE}/api/v1/generations/history?${params.toString()}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    throw new Error("Failed to fetch generation history");
  }
  return res.json();
}

/**
 * Toggle favorite on a generation.
 */
export async function toggleFavorite(
  generationId: number
): Promise<FavoriteToggleResponse> {
  const res = await fetch(`${API_BASE}/api/v1/generations/${generationId}/favorite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    throw new Error("Failed to update favorite status");
  }
  return res.json();
}

/**
 * Delete a generation record.
 */
export async function deleteGeneration(generationId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/generations/${generationId}`, {
    method: "DELETE",
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    throw new Error("Failed to delete generation");
  }
}

/**
 * Delete several of the user's generations at once. Returns how many were deleted.
 */
export async function deleteGenerations(ids: number[]): Promise<number> {
  const res = await fetch(`${API_BASE}/api/v1/generations/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    throw new Error("Failed to delete generations");
  }
  return (await res.json()).deleted;
}

/**
 * Fetch generation statistics for the current user.
 */
export async function getUserStats(): Promise<UserStats> {
  const res = await fetch(`${API_BASE}/api/v1/generations/stats`);

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    throw new Error("Failed to fetch user stats");
  }
  return res.json();
}

/**
 * Direct file download helper for cross-origin image URLs.
 */
export async function downloadImage(imageUrl: string, filename = "picapp-generation.jpg"): Promise<void> {
  try {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(imageUrl, "_blank");
  }
}