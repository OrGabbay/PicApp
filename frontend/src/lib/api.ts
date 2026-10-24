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
} from "@/src/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Read the user's stored AI key from localStorage (supporting universal key & legacy key). */
export function getUserApiKey(): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("ai_user_key")?.trim() ||
    localStorage.getItem("anthropic_user_key")?.trim() ||
    ""
  );
}

/** Read the user's selected provider or auto-detect preference. */
export function getUserProvider(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ai_user_provider")?.trim() || "";
}

function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token")?.trim() ?? "";
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
    Authorization: `Bearer ${getAuthToken()}`,
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
    Authorization: `Bearer ${getAuthToken()}`,
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
  onlyFavorites = false
): Promise<PaginatedGenerations> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (onlyFavorites) {
    params.set("only_favorites", "true");
  }

  const res = await fetch(`${API_BASE}/api/v1/generations/history?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

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
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to delete generation");
  }
}

/**
 * Fetch generation statistics for the current user.
 */
export async function getUserStats(): Promise<UserStats> {
  const res = await fetch(`${API_BASE}/api/v1/generations/stats`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

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