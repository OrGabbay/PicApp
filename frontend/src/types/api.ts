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

export interface GenerationItem {
  id: number;
  prompt_id: number;
  image_url: string;
  original_prompt: string;
  enhanced_prompt?: string;
  engine?: string;
  created_at: string;
  is_favorite: boolean;
  /** Set when an API key was supplied but could not be used (free engine was used instead). */
  key_warning?: string | null;
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