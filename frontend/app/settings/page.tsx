'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { enhancePrompt, detectProvider } from '@/src/lib/api';

const PROVIDER_OPTIONS = [
  { id: '', label: '⚡ Auto-Detect Company (Recommended)' },
  { id: 'openai', label: '🟢 OpenAI (GPT-4o / ChatGPT)' },
  { id: 'anthropic', label: '🟣 Anthropic (Claude 3.5)' },
  { id: 'gemini', label: '🔵 Google (Gemini 1.5 Flash)' },
  { id: 'groq', label: '🟠 Groq (Llama 3.3 70B)' },
  { id: 'openrouter', label: '🌐 OpenRouter (Multi-Model)' },
];

export default function SettingsPage() {
  const [userKey, setUserKey]           = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [showKey, setShowKey]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [testing, setTesting]           = useState(false);
  const [testResult, setTestResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  // Load existing key and provider preference on mount
  useEffect(() => {
    const key =
      localStorage.getItem('ai_user_key') ||
      localStorage.getItem('anthropic_user_key') ||
      '';
    const prov = localStorage.getItem('ai_user_provider') || '';
    setUserKey(key);
    setSelectedProvider(prov);

    if (key.trim()) {
      detectCompany(key.trim());
    }
  }, []);

  const detectCompany = async (key: string) => {
    if (!key.trim()) {
      setDetectedProvider(null);
      setDetectedName(null);
      return;
    }
    const res = await detectProvider(key);
    if (res.provider !== 'unknown') {
      setDetectedProvider(res.provider);
      setDetectedName(res.name);
    } else {
      setDetectedProvider(null);
      setDetectedName(null);
    }
  };

  const handleKeyChange = (val: string) => {
    setUserKey(val);
    setSaved(false);
    setTestResult(null);
    detectCompany(val);
  };

  const handleSave = () => {
    const trimmed = userKey.trim();
    if (trimmed) {
      localStorage.setItem('ai_user_key', trimmed);
      localStorage.setItem('anthropic_user_key', trimmed); // backward compat
      if (selectedProvider) {
        localStorage.setItem('ai_user_provider', selectedProvider);
      } else {
        localStorage.removeItem('ai_user_provider');
      }
    } else {
      localStorage.removeItem('ai_user_key');
      localStorage.removeItem('anthropic_user_key');
      localStorage.removeItem('ai_user_provider');
    }
    setSaved(true);
    setTestResult(null);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleClear = () => {
    localStorage.removeItem('ai_user_key');
    localStorage.removeItem('anthropic_user_key');
    localStorage.removeItem('ai_user_provider');
    setUserKey('');
    setSelectedProvider('');
    setDetectedProvider(null);
    setDetectedName(null);
    setSaved(false);
    setTestResult(null);
  };

  const handleTestKey = async () => {
    const trimmed = userKey.trim();
    if (!trimmed) {
      setTestResult({ ok: false, msg: 'Please enter an API key to test.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      localStorage.setItem('ai_user_key', trimmed);
      if (selectedProvider) {
        localStorage.setItem('ai_user_provider', selectedProvider);
      }
      const res = await enhancePrompt({
        prompt: 'A futuristic city in the clouds',
        provider: selectedProvider || undefined,
      });

      if (res.engine && res.engine !== 'Preset') {
        setTestResult({
          ok: true,
          msg: `Success! ${res.engine} successfully verified and is active for prompt enhancement.`,
        });
      } else {
        setTestResult({
          ok: false,
          msg: res.error || 'Could not verify connection with this key. Check that your key is valid and has active credits.',
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const hasKey = userKey.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-10">
      {/* Header */}
      <div className="mb-8 pb-5 border-b border-zinc-800">
        <Link
          href="/studio"
          className="text-xs text-zinc-500 hover:text-white mb-3 inline-flex items-center gap-1 transition-colors"
        >
          ← Back to Studio
        </Link>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">AI Settings</h1>
        <p className="text-zinc-400 text-xs mt-1">
          Bring your own key from any major AI provider, or use free default generation
        </p>
      </div>

      {/* Main Configuration Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-7 mb-6 shadow-xl shadow-black/40">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-blue-900/30">
            🤖
          </div>
          <div>
            <h2 className="text-white font-bold text-base">Multi-Provider AI Key (BYOK)</h2>
            <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
              Paste your API key from <strong>OpenAI</strong>, <strong>Anthropic</strong>, <strong>Google Gemini</strong>, or <strong>Groq</strong>.
              The app automatically identifies your provider and switches to their AI model.
            </p>
          </div>
        </div>

        {/* API Key Input */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
            <label htmlFor="api-key" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              API Key
            </label>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showKey ? 'Hide Key' : 'Show Key'}
            </button>
          </div>

          <input
            id="api-key"
            type={showKey ? 'text' : 'password'}
            placeholder="Paste your key: sk-..., sk-ant-..., AIzaSy..., or gsk_..."
            value={userKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="bg-zinc-950 text-white text-xs px-4 py-3 rounded-2xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 w-full font-mono transition-all"
          />

          {/* Automatic Company Detection Badge */}
          {detectedName && (
            <div className="flex items-center gap-2 mt-1.5 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-800/40 text-blue-300 text-xs font-medium">
              <span>🏢</span>
              <span>Detected Company:</span>
              <strong className="text-white">{detectedName}</strong>
            </div>
          )}
        </div>

        {/* Provider Override Dropdown */}
        <div className="flex flex-col gap-2 mb-6">
          <label htmlFor="provider-select" className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Provider Selection
          </label>
          <select
            id="provider-select"
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value);
              setSaved(false);
              setTestResult(null);
            }}
            className="bg-zinc-950 text-zinc-200 text-xs px-3.5 py-2.5 rounded-2xl border border-zinc-700/80 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={`p-3.5 rounded-2xl text-xs mb-5 flex items-start gap-2.5 ${
              testResult.ok
                ? 'bg-emerald-950/40 border border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/40 border border-rose-800/60 text-rose-300'
            }`}
          >
            <span className="text-base">{testResult.ok ? '✓' : '⚠️'}</span>
            <p className="leading-relaxed">{testResult.msg}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/30 active:scale-[0.98]'
            }`}
          >
            {saved ? '✓ Saved Key' : 'Save Key'}
          </button>

          <button
            type="button"
            onClick={handleTestKey}
            disabled={testing || !hasKey}
            className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {testing && (
              <span className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin inline-block" />
            )}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {hasKey && (
            <button
              type="button"
              onClick={handleClear}
              className="py-2.5 px-4 rounded-xl text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Supported Providers Reference */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 text-xs text-zinc-400 space-y-4">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          <span>⚡</span> Supported Companies & Key Prefixes
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80">
            <strong className="text-white block mb-0.5">🟢 OpenAI (ChatGPT)</strong>
            <span className="text-[11px] text-zinc-500 font-mono">Starts with sk-proj- or sk-</span>
          </div>
          <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80">
            <strong className="text-white block mb-0.5">🟣 Anthropic (Claude)</strong>
            <span className="text-[11px] text-zinc-500 font-mono">Starts with sk-ant-</span>
          </div>
          <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80">
            <strong className="text-white block mb-0.5">🔵 Google (Gemini)</strong>
            <span className="text-[11px] text-zinc-500 font-mono">Starts with AIzaSy... or AQ...</span>
          </div>
          <div className="bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/80">
            <strong className="text-white block mb-0.5">🟠 Groq (Llama 3.3)</strong>
            <span className="text-[11px] text-zinc-500 font-mono">Starts with gsk_...</span>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60 leading-relaxed">
          Your key is stored solely in your local browser storage and is never saved to our database.
          When no key is configured, PicApp automatically uses fast built-in prompt engineering presets.
        </p>
      </div>
    </div>
  );
}