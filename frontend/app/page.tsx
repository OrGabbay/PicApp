// frontend/app/page.tsx
import Link from 'next/link';

const FEATURES = [
  {
    icon: '✨',
    title: 'AI Prompt Enhancement',
    desc: 'Claude AI transforms your simple ideas into rich, detailed prompts engineered for stunning results.',
  },
  {
    icon: '⚡',
    title: 'Instant Generation',
    desc: 'Powered by Pollinations.ai — high-quality images generated from any prompt in seconds.',
  },
  {
    icon: '🔒',
    title: 'Bring Your Own Key',
    desc: 'Your Anthropic API key is stored locally in your browser and never sent to our servers.',
  },
];

// Pre-encoded sample image URLs shown on the landing page
const SAMPLES = [
  {
    url: 'https://image.pollinations.ai/prompt/majestic%20snow-capped%20mountain%20at%20golden%20hour%2C%20dramatic%20storm%20clouds%2C%20cinematic%20photography%2C%208k?width=512&height=512&nologo=true',
    label: 'Majestic Mountains',
  },
  {
    url: 'https://image.pollinations.ai/prompt/neon%20cyberpunk%20city%20street%20at%20night%2C%20rain%20reflections%2C%20atmospheric%20fog%2C%20cinematic%204k?width=512&height=512&nologo=true',
    label: 'Cyberpunk City',
  },
  {
    url: 'https://image.pollinations.ai/prompt/abstract%20fluid%20art%2C%20swirling%20blue%20purple%20and%20gold%20tones%2C%20digital%20painting%2C%208k%20ultra%20detail?width=512&height=512&nologo=true',
    label: 'Abstract Art',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 py-28 overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/50 border border-blue-800/40 text-blue-400 text-sm mb-8">
            <span>✨</span>
            <span>Powered by Claude AI + Pollinations.ai</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            Turn words into{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
              stunning images
            </span>
          </h1>

          <p className="text-zinc-400 text-lg leading-relaxed mb-10">
            Describe any scene, character, or concept — PicApp's AI will craft the perfect prompt and generate a beautiful image for you.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/studio"
              className="px-7 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-900/40 active:scale-[0.98] text-base"
            >
              🎨 Open Studio
            </Link>
            <Link
              href="/gallery"
              className="px-7 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors text-base"
            >
              View Gallery
            </Link>
          </div>
        </div>
      </section>

      {/* ── Sample Images ── */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SAMPLES.map((sample) => (
            <div
              key={sample.label}
              className="group relative rounded-2xl overflow-hidden border border-zinc-800 aspect-square bg-zinc-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sample.url}
                alt={sample.label}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end p-4">
                <span className="text-white text-sm font-medium">{sample.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="px-6 pb-24 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="text-3xl mb-4">{icon}</div>
              <h3 className="text-white font-semibold mb-2">{title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
