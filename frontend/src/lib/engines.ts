import type { KeyProvider } from '@/src/lib/keys';
import type { ImageEngineId } from '@/src/lib/preferences';
import type { MessageKey } from '@/src/i18n';

export type EngineId = ImageEngineId;

export interface EngineInfo {
  id: EngineId;
  /** Brand/model name, shown as-is in every language */
  name: string;
  /** Short description (translated) */
  description: MessageKey;
  /** 'free' engines cost nothing (some need a free account); 'paid' ones bill the user's account */
  tier: 'free' | 'paid';
  /** Approximate cost per image for paid engines */
  price: string | null;
  /** Key the engine needs; null = works for everyone */
  provider: KeyProvider | null;
}

// Must match backend/providers.py IMAGE_ENGINES
export const ENGINES: EngineInfo[] = [
  { id: 'free', name: 'Pollinations Classic', description: 'engine.free', tier: 'free', price: null, provider: null },
  { id: 'pollinations-klein', name: 'Pollinations FLUX.2 klein', description: 'engine.pollinationsKlein', tier: 'free', price: null, provider: 'pollinations' },
  { id: 'pollinations-zimage', name: 'Pollinations Z-Image Turbo', description: 'engine.pollinationsZimage', tier: 'free', price: null, provider: 'pollinations' },
  { id: 'pollinations-schnell', name: 'Pollinations FLUX.1 schnell', description: 'engine.pollinationsSchnell', tier: 'free', price: null, provider: 'pollinations' },
  { id: 'pollinations-gptmini', name: 'Pollinations GPT Image 1 mini', description: 'engine.pollinationsGptMini', tier: 'free', price: null, provider: 'pollinations' },
  { id: 'cloudflare-schnell', name: 'Cloudflare FLUX.1 schnell', description: 'engine.cloudflareSchnell', tier: 'free', price: null, provider: 'cloudflare' },
  { id: 'openai', name: 'OpenAI GPT Image 2', description: 'engine.openai', tier: 'paid', price: '$0.05', provider: 'openai' },
  { id: 'gemini', name: 'Google Nano Banana 2', description: 'engine.gemini', tier: 'paid', price: '$0.07', provider: 'google' },
  { id: 'gemini-pro', name: 'Google Nano Banana Pro', description: 'engine.geminiPro', tier: 'paid', price: '$0.13', provider: 'google' },
  { id: 'flux', name: 'Black Forest Labs FLUX.2 Pro', description: 'engine.flux', tier: 'paid', price: '$0.03', provider: 'bfl' },
];

export const PROVIDER_NAMES: Record<KeyProvider, string> = {
  pollinations: 'Pollinations',
  cloudflare: 'Cloudflare',
  openai: 'OpenAI',
  google: 'Google AI Studio',
  bfl: 'Black Forest Labs',
  anthropic: 'Anthropic',
  groq: 'Groq',
};

/** Where users create a key for each provider */
export const PROVIDER_KEY_URLS: Record<KeyProvider, string> = {
  pollinations: 'https://enter.pollinations.ai/keys',
  cloudflare: 'https://dash.cloudflare.com/profile/api-tokens',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  bfl: 'https://dashboard.bfl.ai/keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  groq: 'https://console.groq.com/keys',
};

/** Providers whose accounts are free (their engines cost nothing) */
export const FREE_PROVIDERS: KeyProvider[] = ['pollinations', 'cloudflare'];

export function getEngine(id: string): EngineInfo {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}
