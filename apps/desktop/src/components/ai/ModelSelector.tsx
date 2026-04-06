import { useState } from 'react';
import type { OllamaState } from '../../hooks/useOllama';
import type { DownloadProgress } from '../../lib/tauri';

interface Props {
  models: OllamaState['models'];
  selectedModel: string;
  onSelect: (model: string) => void;
  pullModel: OllamaState['pullModel'];
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / 1_073_741_824;
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1_048_576;
  return `${Math.round(mb)} MB`;
}

export function ModelSelector({ models, selectedModel, onSelect, pullModel }: Props) {
  const [showDownload, setShowDownload] = useState(false);
  const [downloadInput, setDownloadInput] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    const model = downloadInput.trim();
    if (!model) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadProgress(null);
    try {
      await pullModel(model, (p: DownloadProgress) => {
        setDownloadProgress(p);
      });
      setShowDownload(false);
      setDownloadInput('');
      // Select the newly downloaded model
      onSelect(model.includes(':') ? model : `${model}:latest`);
    } catch (e) {
      setDownloadError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  const progressPct =
    downloadProgress &&
    downloadProgress.total != null &&
    downloadProgress.completed != null &&
    downloadProgress.total > 0
      ? Math.round((downloadProgress.completed / downloadProgress.total) * 100)
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Model dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          className="form-input"
          value={selectedModel}
          onChange={e => onSelect(e.target.value)}
          style={{ flex: 1, fontSize: 12 }}
          disabled={models.length === 0}
        >
          {models.length === 0 ? (
            <option value="">No models available</option>
          ) : (
            models.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}{m.size ? ` — ${formatSize(m.size)}` : ''}
              </option>
            ))
          )}
        </select>
        <button
          onClick={() => { setShowDownload(v => !v); setDownloadError(null); }}
          title="Download a model"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            background: showDownload ? 'var(--accent-light)' : 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            cursor: 'pointer',
            color: showDownload ? 'var(--accent)' : 'var(--fg-muted)',
            flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {/* Download icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Download panel */}
      {showDownload && (
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 7,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Download Model
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              placeholder="e.g. llama3.2:3b"
              value={downloadInput}
              onChange={e => setDownloadInput(e.target.value)}
              disabled={downloading}
              style={{ flex: 1, fontSize: 12 }}
              onKeyDown={e => { if (e.key === 'Enter') handleDownload(); }}
            />
            <button
              className="btn btn-sm btn-accent"
              onClick={handleDownload}
              disabled={downloading || !downloadInput.trim()}
            >
              {downloading ? 'Downloading…' : 'Pull'}
            </button>
          </div>

          {/* Progress bar */}
          {downloading && downloadProgress && (
            <div>
              <div
                style={{
                  height: 4,
                  background: 'var(--bg-surface)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: progressPct !== null ? `${progressPct}%` : '20%',
                    background: 'var(--accent)',
                    borderRadius: 2,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>
                {downloadProgress.status}
                {progressPct !== null && ` — ${progressPct}%`}
              </div>
            </div>
          )}

          {downloadError && (
            <div style={{ fontSize: 11, color: 'var(--danger, #ef4444)' }}>{downloadError}</div>
          )}
        </div>
      )}
    </div>
  );
}
