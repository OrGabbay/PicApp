// frontend/src/types/api.ts

export interface User {
  id: number;
  email: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface EnhancePromptRequest {
  prompt: string;
}

export interface EnhancePromptResponse {
  original_prompt: string;
  enhanced_prompt: string;
}

export interface GenerationRequest {
  original_prompt: string;
  enhanced_prompt?: string;
  aspect_ratio?: string;
}

export interface GenerationItem {
  id: number;
  prompt_id: number;
  image_url: string;
  original_prompt: string;
  enhanced_prompt?: string;
  created_at: string;
  is_favorite: boolean;
}

export interface PaginatedGenerations {
  items: GenerationItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}