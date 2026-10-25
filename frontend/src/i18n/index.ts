'use client';
import { Fragment, createElement, type ReactNode } from 'react';
import { usePreferences, type Language } from '@/src/lib/preferences';
import en, { type MessageKey } from './en';
import he from './he';
import es from './es';
import fr from './fr';

export type { MessageKey };

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { en, he, es, fr };

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  he: 'עברית',
  es: 'Español',
  fr: 'Français',
};

type Vars = Record<string, string | number>;

export function translate(language: Language, key: MessageKey, vars?: Vars): string {
  // Fall back to English, then to the key itself, so UI text is never blank
  const text = DICTIONARIES[language]?.[key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match)) : text;
}

/** Translations for the current language preference. */
export function useI18n() {
  const { language } = usePreferences();

  const t = (key: MessageKey, vars?: Vars) => translate(language, key, vars);

  /** Like t(), but replaces <name> placeholders with React nodes (e.g. links). */
  const rich = (key: MessageKey, nodes: Record<string, ReactNode>, vars?: Vars): ReactNode =>
    t(key, vars)
      .split(/(<\w+>)/)
      .map((part, i) => {
        const name = /^<(\w+)>$/.exec(part)?.[1];
        return createElement(Fragment, { key: i }, name && name in nodes ? nodes[name] : part);
      });

  const formatDate = (value: string | Date) => new Date(value).toLocaleDateString(language);

  return { t, rich, formatDate, language };
}

/** Known English messages from the backend, mapped so they can be shown translated. */
const SERVER_MESSAGES: Record<string, MessageKey> = {
  'Incorrect email or password': 'auth.incorrect',
  'Email already registered': 'auth.emailTaken',
  'Invalid or expired token': 'common.sessionExpired',
  'Cannot connect to the backend. Check that it is running.': 'common.backendOffline',
  'Login failed. Check that the backend is running.': 'common.backendOffline',
  'Too many requests. Please wait and try again.': 'common.tooManyRequests',
  'Invalid or expired reset link': 'auth.resetInvalid',
  'Incorrect password': 'profile.incorrectPassword',
};

export function translateServerMessage(language: Language, message: string): string {
  const key = SERVER_MESSAGES[message];
  return key ? translate(language, key) : message;
}

/** Builds the API key popup text from the backend's reason code, in the current language. */
export function describeKeyIssue(
  language: Language,
  issue: { code?: string | null; provider?: string | null; fallback?: string | null; message?: string | null },
  /** 'reason' = only why the key failed (no "used the free engine instead" sentence) */
  context: 'generate' | 'enhance' | 'reason',
): string | null {
  const reasonKey = `keyIssue.${issue.code}` as MessageKey;
  if (!issue.code || !(reasonKey in en)) {
    // Unknown code (or an older backend): show its English message as-is
    return issue.message ?? null;
  }
  const reason = translate(language, reasonKey, { provider: issue.provider || 'AI' });
  if (context === 'reason') return reason;
  const fallbackKey: MessageKey =
    context === 'enhance' ? 'keyIssue.fallbackEnhance'
    : issue.fallback === 'partial' ? 'keyIssue.fallbackPartial'
    : 'keyIssue.fallbackFree';
  return `${reason} ${translate(language, fallbackKey)}`;
}
