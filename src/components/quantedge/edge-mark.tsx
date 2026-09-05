// DEEYOUNG PRO — Brand emblem. Standalone module so server surfaces
// (/admin/*) can render the mark without importing the landing bundle.

export function EdgeMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <radialGradient id="dym-tile" cx="30%" cy="18%" r="105%">
          <stop offset="0%" stopColor="#1b1b1f" />
          <stop offset="55%" stopColor="#101013" />
          <stop offset="100%" stopColor="#070708" />
        </radialGradient>
        <linearGradient id="dym-d" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#e8eaef" />
          <stop offset="100%" stopColor="#c3c7d1" />
        </linearGradient>
        <linearGradient id="dym-wire" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="55%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#f87171" />
        </linearGradient>
        <clipPath id="dym-clip">
          <path d="M148 128 H246 C338 128 402 182 402 260 C402 338 338 392 246 392 H148 Z" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="118" fill="url(#dym-tile)" />
      <rect x="10" y="10" width="492" height="492" rx="110" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <path d="M148 128 H246 C338 128 402 182 402 260 C402 338 338 392 246 392 H148 Z" fill="url(#dym-d)" />
      <path d="M228 204 H282 C308 204 326 228 326 260 C326 292 308 316 282 316 H228 Z" fill="#0b0b0d" />
      <g clipPath="url(#dym-clip)">
        <path d="M194 332.8 L436 116.8 L456 139.2 L214 355.2 Z" fill="#0c0c0e" />
        <path d="M199 338.4 L441 122.4 L451 133.6 L209 349.6 Z" fill="url(#dym-wire)" />
      </g>
      <path d="M371 184.4 L443 121.4 L453 132.6 L381 195.6 Z" fill="url(#dym-wire)" />
      <circle cx="461" cy="119" r="10" fill="#ef4444" />
      <circle cx="461" cy="119" r="5.5" fill="#fecaca" />
    </svg>
  );
}
