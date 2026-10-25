'use client';
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';
export type Language = 'en' | 'he' | 'es' | 'fr';
export type GallerySize = 'small' | 'medium' | 'large';
export type GallerySort = 'newest' | 'oldest';
export type GalleryLayout = 'grid' | 'masonry';
export type ImageEngineId =
  | 'free' | 'openai' | 'gemini' | 'gemini-pro' | 'flux'
  | 'pollinations-klein' | 'pollinations-zimage' | 'pollinations-schnell' | 'pollinations-gptmini'
  | 'cloudflare-schnell';

export interface Preferences {
  theme: ThemePreference;
  language: Language;
  gallerySize: GallerySize;
  gallerySort: GallerySort;
  galleryLayout: GalleryLayout;
  /** Image engine selected in the Studio */
  engine: ImageEngineId;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  language: 'en',
  gallerySize: 'medium',
  gallerySort: 'newest',
  galleryLayout: 'grid',
  engine: 'free',
};

export const RTL_LANGUAGES: Language[] = ['he'];

const STORAGE_KEY = 'picapp_prefs';

/**
 * Runs in <head> before the page paints (see app/layout.tsx), so the saved theme and text
 * direction are applied without a flash. Keep in sync with applyPreferencesToDocument.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{
var p=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'{}');var d=document.documentElement;
var t=p.theme||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
d.setAttribute('data-theme',t);var l=p.language||'en';d.lang=l;d.dir=${JSON.stringify(RTL_LANGUAGES)}.indexOf(l)>=0?'rtl':'ltr';
}catch(e){}})();`;

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPrefs: Preferences = DEFAULT_PREFERENCES;

function readPreferences(): Preferences {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {}
  // Return the same object while storage is unchanged, as useSyncExternalStore requires
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedPrefs = { ...DEFAULT_PREFERENCES, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      cachedPrefs = DEFAULT_PREFERENCES;
    }
  }
  return cachedPrefs;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep tabs in sync when preferences change in another tab
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function resolveTheme(theme: ThemePreference): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyPreferencesToDocument(prefs: Preferences) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(prefs.theme));
  root.lang = prefs.language;
  root.dir = RTL_LANGUAGES.includes(prefs.language) ? 'rtl' : 'ltr';
}

export function updatePreferences(changes: Partial<Preferences>) {
  const next = { ...readPreferences(), ...changes };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  applyPreferencesToDocument(next);
  listeners.forEach((listener) => listener());
}

/** Current preferences. Renders defaults on the server, then the saved values in the browser. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, readPreferences, () => DEFAULT_PREFERENCES);
}
