// Logo « bouffon » minimaliste (SVG inline, teinte héritée via currentColor).
export function JokerLogo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Trois pointes du chapeau */}
      <path d="M32 34 C 26 22, 16 14, 8 16 C 14 24, 16 30, 18 38 Z" />
      <path d="M32 34 C 32 20, 32 12, 32 6 C 38 14, 40 22, 40 32 Z" />
      <path d="M34 36 C 42 26, 50 20, 58 22 C 52 28, 48 34, 46 42 Z" />
      {/* Grelots */}
      <circle cx="8" cy="15" r="3.4" />
      <circle cx="32" cy="6" r="3.4" />
      <circle cx="58" cy="21" r="3.4" />
      {/* Visage (croissant) */}
      <path d="M32 36 a 12 12 0 1 0 12 14 a 9.5 9.5 0 1 1 -12 -14 Z" />
    </svg>
  );
}
