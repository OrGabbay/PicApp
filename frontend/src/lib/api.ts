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

/** All backend calls go through the Next.js proxy, which attaches the login cookie's token. */
const API_BASE = "/api/backend";

/** Thrown when an endpoint needs a logged-in user (backend answered 401). */
export class AuthRequiredError extends Error {
  constructor() {
    super("Please log in to continue.");
    this.name = "AuthRequiredError";
  }
}

/** Read the user's stored AI key from localStorage (supporting universal key & legacy key). */
export function getUserApiKey(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("ai_user_key")?.trim() ||
    localStorage.getItem("anthropic_user_key")?.trim() ||
    ""
  );
}

/** Remove the stored AI key and provider (called on logout so the key doesn't outlive the session). */
export function clearStoredApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("ai_user_key");
  localStorage.removeItem("anthropic_user_key");
  localStorage.removeItem("ai_user_provider");
}

/** Read the user's selected provider or auto-detect preference. */
export function getUserProvider(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ai_user_provider")?.trim() || "";
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
  payload: EnhancePromptRequest
): Promise<EnhancePromptResponse> {
  const apiKey = getUserApiKey();
  const provider = payload.provider || getUserProvider();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
    headers["x-anthropic-key"] = apiKey;
  }
  if (provider) {
    headers["x-provider"] = provider;
  }

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
  const apiKey = getUserApiKey();
  const provider = payload.provider || getUserProvider();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
    headers["x-anthropic-key"] = apiKey;
  }
  if (provider) {
    headers["x-provider"] = provider;
  }

  const res = await fetch(`${API_BASE}/api/v1/generations/create`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new AuthRequiredError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Failed to generate image");
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