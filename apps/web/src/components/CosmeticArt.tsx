// Hand-drawn SVG hats that sit on Popcorn's actual head (emoji like 🎉 read
// as decorations, not headwear). Shared by the pet view and the wardrobe so
// the preview matches what she actually wears.

export function HatArt({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "hat-party":
      return (
        <svg viewBox="0 0 64 60" className={className} aria-hidden>
          <defs>
            <clipPath id="party-cone">
              <polygon points="32,6 12,56 52,56" />
            </clipPath>
          </defs>
          <polygon points="32,6 12,56 52,56" fill="#fb7185" />
          <g clipPath="url(#party-cone)">
            <rect x="0" y="18" width="64" height="9" fill="#fde68a" transform="rotate(-8 32 22)" />
            <rect x="0" y="36" width="64" height="9" fill="#7dd3fc" transform="rotate(-8 32 40)" />
          </g>
          <polygon points="32,6 12,56 52,56" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="32" cy="7" r="6" fill="#fde68a" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );
    case "hat-crown":
      return (
        <svg viewBox="0 0 64 46" className={className} aria-hidden>
          <path
            d="M6 38 L6 14 L20 26 L32 6 L44 26 L58 14 L58 38 Z"
            fill="#fbbf24"
            stroke="#b45309"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <rect x="6" y="34" width="52" height="8" rx="3" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
          <circle cx="17" cy="38" r="3" fill="#fb7185" />
          <circle cx="32" cy="38" r="3" fill="#7dd3fc" />
          <circle cx="47" cy="38" r="3" fill="#86efac" />
          <circle cx="32" cy="9" r="3" fill="#fb7185" />
        </svg>
      );
    case "hat-graduation":
      return (
        <svg viewBox="0 0 64 50" className={className} aria-hidden>
          <rect x="20" y="20" width="24" height="14" rx="4" fill="#475569" />
          <polygon
            points="32,4 60,18 32,32 4,18"
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <line x1="32" y1="18" x2="51" y2="36" stroke="#fde68a" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="52" cy="39" r="4" fill="#fde68a" />
          <circle cx="32" cy="18" r="2.5" fill="#fde68a" />
        </svg>
      );
    default:
      return null;
  }
}
