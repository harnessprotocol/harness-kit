import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = 'Harness Kit — One config for every AI coding tool';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a12',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow blob */}
        <div
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(117,136,255,0.14) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            background: '#13141d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
          }}
        >
          {/* PROVISIONAL mark — mirrors HarnessKitLogo.tsx; redesign planned */}
          <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
            <g stroke="#7d8dff" strokeWidth="2.8" strokeLinecap="round">
              <path d="M9 9.5 C 15 11, 17.5 13.5, 19.4 14.9" />
              <path d="M9 22.5 C 15 21, 17.5 18.5, 19.4 17.1" />
            </g>
            <circle cx="9" cy="9.5" r="1.9" fill="#7d8dff" />
            <circle cx="9" cy="22.5" r="1.9" fill="#7d8dff" />
            <circle cx="22" cy="16" r="3.3" fill="#7d8dff" />
          </svg>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: '#e6e8ee',
            letterSpacing: -1.5,
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          Harness Kit
        </div>

        {/* Sub-headline */}
        <div
          style={{
            fontSize: 22,
            color: '#9aa0ad',
            textAlign: 'center',
            maxWidth: 600,
            lineHeight: 1.4,
          }}
        >
          One config for every AI coding tool
        </div>

        {/* Tool pills */}
        <div style={{ display: 'flex', gap: 10, marginTop: 40 }}>
          {['Claude Code', 'Cursor', 'Copilot', 'Windsurf'].map((tool) => (
            <div
              key={tool}
              style={{
                padding: '6px 14px',
                borderRadius: 9999,
                background: 'rgba(34,177,236,0.08)',
                border: '1px solid rgba(34,177,236,0.2)',
                color: '#4ec7f2',
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
              }}
            >
              {tool}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div style={{ position: 'absolute', bottom: 28, color: '#4b5563', fontSize: 14 }}>
          harnesskit.ai
        </div>
      </div>
    ),
    { ...size },
  );
}
