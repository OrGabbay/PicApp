// frontend/src/lib/api.ts
import { EnhancePromptRequest, EnhancePromptResponse, GenerationRequest, GenerationItem } from "@/src/types/api";

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