'use client';
import { useEffect } from 'react';
import { applyPreferencesToDocument, usePreferences } from '@/src/lib/preferences';

/** Keeps <html> theme/lang/dir in sync with preferences, including OS theme changes for "system". */
export default function PreferencesSync() {
  const prefs = usePreferences();

  useEffect(() => {
    applyPreferencesToDocument(prefs);
    if (prefs.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyPreferencesToDocument(prefs);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [prefs]);

  return null;
}
