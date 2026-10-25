'use client';
import { useSyncExternalStore } from 'react';

/**
 * The user's own AI provider keys, one per provider, kept in this browser only.
 * Keys are a logged-in feature (the backend ignores them for guests) and are removed on logout.
 */
export type KeyProvider = 'pollinations' | 'cloudflare' | 'openai' | 'google' | 'bfl' | 'anthropic' | 'groq';

/** Providers whose key can rewrite prompts ("Enhance Prompt" and free-engine generations) */
export const ENHANCER_PROVIDERS: KeyProvider[] = ['anthropic', 'openai', 'google', 'groq'];

export interface StoredKeys {
  keys: Partial<Record<KeyProvider, string>>;
  /** Which key enhances prompts; 'auto' = the first connected one in ENHANCER_PROVIDERS */
  enhancer: KeyProvider | 'auto';
}

const STORAGE_KEY = 'picapp_keys';
const LEGACY_KEYS = ['ai_user_key', 'anthropic_user_key', 'ai_user_provider'];
const EMPTY: StoredKeys = { keys: {}, enhancer: 'auto' };

/** Provider of a key, recognized by its prefix (BFL and Cloudflare keys have none, so they're never guessed). */
export function guessProvider(key: string): KeyProvider | null {
  const k = key.trim();
  if (k.startsWith('sk_')) return 'pollinations'; // OpenAI keys use a hyphen: sk-…
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIza') || k.startsWith('AQ')) return 'google';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

/** One-time move from the old single-key storage into the per-provider store. */
function migrateLegacy(): StoredKeys | null {
  const legacy = localStorage.getItem('ai_user_key') || localStorage.getItem('anthropic_user_key');
  if (!legacy) return null;
  const provider = guessProvider(legacy);
  const migrated: StoredKeys = { keys: provider ? { [provider]: legacy.trim() } : {}, enhancer: 'auto' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  return migrated;
}

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: StoredKeys = EMPTY;

function read(): StoredKeys {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null && migrateLegacy()) raw = localStorage.getItem(STORAGE_KEY);
  } catch {}
  // Same object while storage is unchanged, as useSyncExternalStore requires
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = { ...EMPTY, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function write(next: StoredKeys) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getStoredKeys(): StoredKeys {
  return typeof window === 'undefined' ? EMPTY : read();
}

export function setProviderKey(provider: KeyProvider, key: string) {
  const current = read();
  const keys = { ...current.keys };
  if (key.trim()) keys[provider] = key.trim();
  else delete keys[provider];
  write({ ...current, keys });
}

export function setEnhancer(enhancer: StoredKeys['enhancer']) {
  write({ ...read(), enhancer });
}

/** Removes every stored key (on logout, so keys don't outlive the session). */
export function clearAllKeys() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
  listeners.forEach((listener) => listener());
}

/** The key used to enhance prompts, and its provider, or null if none is connected. */
export function resolveEnhancer(stored: StoredKeys): { provider: KeyProvider; key: string } | null {
  const order = stored.enhancer === 'auto' ? ENHANCER_PROVIDERS : [stored.enhancer];
  for (const provider of order) {
    const key = stored.keys[provider];
    if (key) return { provider, key };
  }
  return null;
}

/** The user's stored keys; empty on the server, then the saved values in the browser. */
export function useStoredKeys(): StoredKeys {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
