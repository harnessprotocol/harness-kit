import { ImageResponse } from 'next/og';

export const runtime = 'edge';
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
          background: '#0b0d12',
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
            background: 'radial-gradient(circle, rgba(34,177,236,0.12) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            background: '#0d1016',
            border: '1.5px solid rgba(34,177,236,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
          }}
        >
          <span style={{ fontSize: 28, fontWeight: 700, color: '#4ec7f2', letterSpacing: -1 }}>hk</span>
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
