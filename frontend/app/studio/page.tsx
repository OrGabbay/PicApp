"use client";

import { useState, useEffect } from "react";
import { enhancePrompt, createGeneration, getGenerationHistory } from "../../src/lib/api";
import { GenerationItem } from "../../src/types/api";

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [loadingEnhance, setLoadingEnhance] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // New state for history gallery
  const [history, setHistory] = useState<GenerationItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Fetch history when the component mounts
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoadingHistory(true);
        const data = await getGenerationHistory();
        setHistory(data.items);
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, []);

  const handleEnhance = async () => {
    if (!prompt.trim()) return;
    try {
      setLoadingEnhance(true);
      setError(null);
      const res = await enhancePrompt({ prompt });
      setPrompt(res.enhanced_prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enhance prompt");
    } finally {
      setLoadingEnhance(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    try {
      setLoadingGenerate(true);
      setError(null);
      const res = await createGeneration({
        original_prompt: prompt,
        aspect_ratio: aspectRatio,
      });
      setImageUrl(res.image_url);
      
      // Instantly prepend the new image to the history gallery
      setHistory((prev) => [res, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setLoadingGenerate(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">Prompt Studio</h1>

      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Input Section */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Your Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to create..."
          rows={4}
          className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:bg-zinc-900"
        />
      </div>

      {/* Controls & Enhance Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">Aspect Ratio:</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="p-2 border rounded-md dark:bg-zinc-900"
          >
            <option value="1:1">1:1 (Square)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
          </select>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleEnhance}
            disabled={loadingEnhance || !prompt}
            className="px-4 py-2 border rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 text-sm font-medium transition"
          >
            {loadingEnhance ? "Enhancing..." : "✨ Enhance with Claude"}
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loadingGenerate || !prompt}
            className="px-5 py-2 bg-black text-white dark:bg-white dark:text-black rounded-md disabled:opacity-50 font-medium text-sm transition"
          >
            {loadingGenerate ? "Generating..." : "Generate Image"}
          </button>
        </div>
      </div>

      {/* Preview Output */}
      <div className="mt-8 border border-dashed rounded-xl h-80 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
        {loadingGenerate ? (
          <div className="flex flex-col items-center space-y-2 text-zinc-500">
            <div className="w-8 h-8 border-4 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
            <span className="text-sm">Synthesizing image...</span>
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="Generated output" className="w-full h-full object-contain" />
        ) : (
          <p className="text-zinc-400 text-sm">Enter a prompt and click Generate to see the result.</p>
        )}
      </div>

      {/* History Gallery */}
      <div className="pt-12 border-t mt-12">
        <h2 className="text-xl font-semibold mb-6">Your Previous Generations</h2>
        {loadingHistory ? (
          <div className="text-zinc-500 text-sm">Loading history...</div>
        ) : history.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {history.map((item) => (
              <div key={item.id} className="relative group rounded-lg overflow-hidden border aspect-square bg-zinc-100 dark:bg-zinc-900">
                <img 
                  src={item.image_url} 
                  alt={item.original_prompt} 
                  className="w-full h-full object-cover"
                />
                {/* Hover Overlay displaying the prompt */}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                  <p className="text-xs text-white line-clamp-4">
                    {item.enhanced_prompt || item.original_prompt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-400 text-sm">{"You haven't generated any images yet."}</p>
        )}
      </div>
    </div>
  );
}