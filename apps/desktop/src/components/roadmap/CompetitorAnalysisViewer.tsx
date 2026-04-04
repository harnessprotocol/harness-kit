import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import type { CompetitorAnalysis, Competitor, PainPointSeverity, CompetitorRelevance } from '../../lib/roadmap-types';

interface Props {
  analysis: CompetitorAnalysis | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCompetitor: () => void;
}

const SEVERITY_CONFIG: Record<PainPointSeverity, { color: string; bg: string; border: string }> = {
  high:   { color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.2)' },
  medium: { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.2)' },
  low:    { color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   border: 'rgba(37,99,235,0.2)' },
};

const RELEVANCE_CONFIG: Record<CompetitorRelevance, { color: string; bg: string; border: string }> = {
  high:   { color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   border: 'rgba(22,163,74,0.2)' },
  medium: { color: '#d97706', bg: 'rgba(217,119,6,0.1)',   border: 'rgba(217,119,6,0.2)' },
  low:    { color: '#9a9892', bg: 'rgba(154,152,146,0.1)', border: 'rgba(154,152,146,0.2)' },
};

function Badge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

function CompetitorCard({ competitor }: { competitor: Competitor }) {
  const relCfg = RELEVANCE_CONFIG[competitor.relevance];

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 14,
      background: 'var(--bg-elevated)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-base)' }}>
              {competitor.name}
            </span>
            <Badge label={competitor.relevance} {...relCfg} />
            {competitor.source === 'manual' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '2px 8px', borderRadius: 9999,
                fontSize: 11, fontWeight: 500,
                color: 'var(--fg-muted)', background: 'var(--bg-base)',
                border: '1px solid var(--border-base)',
              }}>
                Manual
              </span>
            )}
            {competitor.marketPosition && (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '2px 8px', borderRadius: 9999,
                fontSize: 11, fontWeight: 500,
                color: 'var(--fg-muted)', background: 'var(--bg-base)',
                border: '1px solid var(--border-base)',
              }}>
                {competitor.marketPosition}
              </span>
            )}
          </div>
          {competitor.description && (
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
              {competitor.description}
            </p>
          )}
        </div>
        {competitor.url && (
          <a
            href={competitor.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12, color: 'var(--accent)',
              textDecoration: 'none', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Visit
          </a>
        )}
      </div>

      {competitor.painPoints.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Pain Points ({competitor.painPoints.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {competitor.painPoints.map(pp => {
              const svCfg = SEVERITY_CONFIG[pp.severity];
              return (
                <div key={pp.id} style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8, padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Badge label={pp.severity} {...svCfg} />
                    <span style={{ fontSize: 13, color: 'var(--fg-base)', flex: 1 }}>{pp.description}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {pp.source && (
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                        Source: <em>{pp.source}</em>
                      </span>
                    )}
                    {pp.frequency && (
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                        Frequency: {pp.frequency}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {competitor.strengths.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Strengths
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {competitor.strengths.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--fg-base)' }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CompetitorAnalysisViewer({ analysis, open, onOpenChange, onAddCompetitor }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="board-scope">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => onOpenChange(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          />
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 680, maxWidth: 'calc(100vw - 32px)',
              maxHeight: '80vh',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-popover)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 51,
            }}
          >
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-base)' }}>
                  Competitor Analysis
                </div>
                {analysis && (
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                    {analysis.competitors.length} competitor{analysis.competitors.length !== 1 ? 's' : ''} analyzed
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={onAddCompetitor}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--fg-base)', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Competitor
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 16,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!analysis ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 10, minHeight: 200,
                  color: 'var(--fg-muted)',
                }}>
                  <span style={{ fontSize: 13 }}>No analysis available</span>
                </div>
              ) : (
                <>
                  {analysis.competitors.map(c => (
                    <CompetitorCard key={c.id} competitor={c} />
                  ))}

                  {analysis.insightsSummary && (
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10, padding: '16px 18px',
                      background: 'rgba(var(--accent-rgb, 99,102,241), 0.04)',
                      display: 'flex', flexDirection: 'column', gap: 14,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-base)' }}>
                        Market Insights
                      </div>

                      {analysis.insightsSummary.topPainPoints.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Top Pain Points
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {analysis.insightsSummary.topPainPoints.map((p, i) => (
                              <li key={i} style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.insightsSummary.differentiatorOpportunities.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Differentiator Opportunities
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {analysis.insightsSummary.differentiatorOpportunities.map((o, i) => (
                              <li key={i} style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.insightsSummary.marketTrends.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Market Trends
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {analysis.insightsSummary.marketTrends.map((t, i) => (
                              <li key={i} style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
