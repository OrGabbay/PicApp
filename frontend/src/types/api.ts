// frontend/src/types/api.ts

export interface User {
  id: number;
  email: string;
  created_at?: string;
}

export interface EnhancePromptRequest {
  prompt: string;
  style?: string;
  provider?: string;
}

export interface EnhancePromptResponse {
  original_prompt: string;
  enhanced_prompt: string;
  engine: string;
  provider?: string;
  error?: string;
  /** Machine-readable reason for `error` (translated by the frontend) */
  error_code?: string | null;
  error_provider?: string | null;
}

export interface DetectProviderResponse {
  provider: string;
  name: string;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3";

export type ImageStyle =
  | "Cinematic"
  | "Photorealistic"
  | "Anime"
  | "Cyberpunk"
  | "Fantasy"
  | "3D Render"
  | "Watercolor"
  | "Minimalist";

export interface CreateGenerationRequest {
  prompt: string;
  aspect_ratio?: AspectRatio;
  style?: string;
  provider?: string;
}

export interface CurrentUser {
  id: number;
  email: string;
  created_at: string;
}

export interface GenerationItem {
  /** null for guest generations, which are not saved to the gallery */
  id: number | null;
  prompt_id: number | null;
  image_url: string;
  original_prompt: string;
  enhanced_prompt?: string;
  engine?: string;
  created_at: string;
  is_favorite: boolean;
  /** Set when an API key was supplied but could not be used (free engine was used instead). */
  key_warning?: string | null;
  key_warning_code?: string | null;
  key_warning_provider?: string | null;
  key_warning_fallback?: 'free' | 'partial' | null;
  /** false when generated as a guest (not saved to the gallery) */
  saved?: boolean;
}

export interface PaginatedGenerations {
  items: GenerationItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface FavoriteToggleResponse {
  generation_id: number;
  is_favorite: boolean;
}

export interface UserStats {
  total_generations: number;
  total_favorites: number;
}