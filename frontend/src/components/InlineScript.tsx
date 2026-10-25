/**
 * Inline <script> that runs during HTML parsing (before first paint). Rendered as text/plain on
 * the client so React doesn't warn about script tags; see Next's "Preventing Flash" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
