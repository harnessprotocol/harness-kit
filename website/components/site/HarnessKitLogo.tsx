interface HarnessKitLogoProps {
  glow?: boolean;
  className?: string;
}

export function HarnessKitLogo({ glow = false, className = 'size-6' }: HarnessKitLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      className={className}
      style={glow ? { filter: 'drop-shadow(0 0 5px rgba(34,177,236,0.4))' } : undefined}
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="6" fill="#0d1016" />
      <text
        x="14"
        y="19"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
        fontSize="12"
        fill="#4ec7f2"
      >
        hk
      </text>
    </svg>
  );
}
