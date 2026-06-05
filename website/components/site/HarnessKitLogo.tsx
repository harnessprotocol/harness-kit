interface HarnessKitLogoProps {
  glow?: boolean;
  className?: string;
}

/**
 * ⚠️ PROVISIONAL LOGO — placeholder, not the final brand mark.
 *
 * This is an abstract "confluence" mark: two source nodes on the left whose
 * streams merge into a single node on the right (many harnesses → one unified
 * config). It is intentionally a stop-gap chosen in a design session on
 * 2026-05-22 while the Iris periwinkle identity was being established.
 *
 * TODO(brand): A proper logo redesign is planned for a future session. When
 * picking this up:
 *   - This component is the single source for the in-product/site mark. The
 *     same artwork is duplicated (by hand, no shared source yet) in:
 *       • website/app/icon.svg          (browser favicon)
 *       • website/app/opengraph-image.tsx (social share card)
 *     Update all three together, plus the desktop app brand + Tauri PNG/.icns
 *     icons under apps/desktop/src-tauri/icons (those need an SVG→raster export).
 *   - Keep it legible at 16px, periwinkle (#7a8bff) on a dark tile (#11151f),
 *     and tied to the product idea (compile one harness.yaml → many AI tools).
 *   - Consider whether a tile is even wanted, or a standalone glyph.
 * See memory: project_design_system_initiative (logo is marked provisional).
 */
export function HarnessKitLogo({ glow = false, className = 'size-6' }: HarnessKitLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      style={glow ? { filter: 'drop-shadow(0 0 6px var(--accent-glow))' } : undefined}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#11151f" />
      <g stroke="#7a8bff" strokeWidth="2.8" strokeLinecap="round" fill="none">
        <path d="M9 9.5 C 15 11, 17.5 13.5, 19.4 14.9" />
        <path d="M9 22.5 C 15 21, 17.5 18.5, 19.4 17.1" />
      </g>
      <circle cx="9" cy="9.5" r="1.9" fill="#7a8bff" />
      <circle cx="9" cy="22.5" r="1.9" fill="#7a8bff" />
      <circle cx="22" cy="16" r="3.3" fill="#7a8bff" />
    </svg>
  );
}
