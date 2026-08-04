export default function Logo({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#tf-g)" fillOpacity="0.16" stroke="url(#tf-g)" strokeOpacity="0.5" strokeWidth="1.2" />
      <path d="M11 8v16" stroke="url(#tf-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 8h9" stroke="url(#tf-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 12l4 4-4 4" stroke="url(#tf-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="tf-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
