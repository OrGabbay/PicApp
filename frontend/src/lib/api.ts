// frontend/src/lib/api.ts
import { EnhancePromptRequest, EnhancePromptResponse, GenerationRequest, GenerationItem, PaginatedGenerations } from "@/src/types/api";

export async function enhancePrompt(payload: EnhancePromptRequest): Promise<EnhancePromptResponse> {
  const token = localStorage.getItem("token") || ""; 
  const res = await fetch("http://localhost:8000/api/v1/prompts/enhance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Failed to enhance prompt");
  return res.json();
}

export async function createGeneration(payload: GenerationRequest): Promise<GenerationItem> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch("http://localhost:8000/api/v1/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Failed to generate image");
  return res.json();
}

export async function getGenerationHistory(page = 1, limit = 20): Promise<PaginatedGenerations> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`http://localhost:8000/api/v1/generations/history?page=${page}&limit=${limit}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}