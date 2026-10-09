/** RT Performance monogram: a condensed RT set inside a squared frame with a brushed-gold base rule. */
export function RTMark({ className = "h-8 w-8", title = "RT Performance" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <defs>
        <linearGradient id="rt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E0C88F" />
          <stop offset="0.5" stopColor="#C8A45D" />
          <stop offset="1" stopColor="#A9873F" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="2" fill="#111113" stroke="url(#rt-gold)" strokeWidth="1.5" />
      <path d="M10 12h11.2c4.5 0 7.3 2.5 7.3 6.4 0 2.9-1.6 5-4.2 5.9L29.6 34h-5.5l-4.6-9h-4.3v9H10V12Zm5.2 4.4v4.4h5.4c1.6 0 2.6-.8 2.6-2.2s-1-2.2-2.6-2.2h-5.4Z" fill="#F7F2E8" />
      <path d="M27.5 12H40v4.6h-3.7V34h-5.2V16.6h-3.6V12Z" fill="#F7F2E8" />
      <rect x="10" y="37.5" width="30" height="2" fill="url(#rt-gold)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <RTMark className="h-8 w-8 shrink-0" />
      <span className="leading-none">
        <span className="display-tight block text-[15px] tracking-[0.08em] text-ivory-50">RT PERFORMANCE</span>
        <span className="mt-0.5 block text-[9px] font-medium uppercase tracking-[0.3em] text-stone-500">Raymond Tate Performance</span>
      </span>
    </span>
  );
}
