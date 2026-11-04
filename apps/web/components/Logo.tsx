/** Logo B, "Node path": two nodes joined by an elbow, the target node in Meta blue. */
export default function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="explanimate-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0064e0" />
          <stop offset="1" stopColor="#0082fb" />
        </linearGradient>
      </defs>
      <rect x=".75" y=".75" width="30.5" height="30.5" rx="8" fill="#141414" stroke="#2a2a2a" strokeWidth="1.5" />
      <rect x="6" y="7" width="8" height="7" rx="2" fill="none" stroke="#ededed" strokeWidth="2" />
      <rect x="18" y="18" width="8" height="7" rx="2" fill="url(#explanimate-logo-g)" />
      <path d="M10 14 V21.5 H18" fill="none" stroke="#ededed" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
