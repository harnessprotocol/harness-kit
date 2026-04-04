import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoadmapData } from '../../hooks/useRoadmapData';
import { useBoardServerReady } from '../../hooks/useBoardServerReady';
import { BoardServerOffline } from '../../components/board/BoardServerOffline';
import { RoadmapEmptyState } from '../../components/roadmap/RoadmapEmptyState';
import { RoadmapHeader } from '../../components/roadmap/RoadmapHeader';
import { RoadmapTabs } from '../../components/roadmap/RoadmapTabs';
import { RoadmapKanbanView } from '../../components/roadmap/RoadmapKanbanView';
import { FeatureCard } from '../../components/roadmap/FeatureCard';
import { FeatureDetailPanel } from '../../components/roadmap/FeatureDetailPanel';
import { PhaseCard } from '../../components/roadmap/PhaseCard';
import { CompetitorAnalysisViewer } from '../../components/roadmap/CompetitorAnalysisViewer';
import { AddFeatureDialog } from '../../components/roadmap/AddFeatureDialog';
import { AddCompetitorDialog } from '../../components/roadmap/AddCompetitorDialog';
import { roadmapApi } from '../../lib/roadmap-api';
import { api } from '../../lib/board-api';
import type { Epic } from '../../lib/board-api';
import type { RoadmapFeature, Roadmap, CompetitorPainPoint, Competitor } from '../../lib/roadmap-types';
import { ROADMAP_PRIORITY_CONFIG } from '../../lib/roadmap-constants';

type TabId = 'kanban' | 'phases' | 'features' | 'priorities';

// ─── EpicPickerModal ────────────────────────────────────────────────────────

interface EpicPickerProps {
  epics: Epic[];
  onPick: (epicId: number) => void;
  onCancel: () => void;
}

function EpicPickerModal({ epics, onPick, onCancel }: EpicPickerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 24,
          width: 360,
          maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Add to Epic
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          Choose which epic to place the new task in.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {epics.map(epic => (
            <button
              key={epic.id}
              onClick={() => onPick(epic.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 7,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{epic.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{epic.tasks.length} tasks</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '7px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── AllFeaturesView ─────────────────────────────────────────────────────────

interface AllFeaturesViewProps {
  features: RoadmapFeature[];
  onSelect: (f: RoadmapFeature) => void;
}

function AllFeaturesView({ features, onSelect }: AllFeaturesViewProps) {
  if (features.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No features yet.
      </div>
    );
  }
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 10,
        alignContent: 'start',
      }}
    >
      {features.map(f => (
        <FeatureCard key={f.id} feature={f} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── PhasesView ──────────────────────────────────────────────────────────────

interface PhasesViewProps {
  roadmap: Roadmap;
  onFeatureSelect: (f: RoadmapFeature) => void;
  onBuild: (f: RoadmapFeature) => void;
}

function PhasesView({ roadmap, onFeatureSelect, onBuild }: PhasesViewProps) {
  if (roadmap.phases.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No phases defined yet.
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[...roadmap.phases].sort((a, b) => a.order - b.order).map(phase => {
        const phaseFeatures = roadmap.features.filter(f => f.phaseId === phase.id);
        return (
          <PhaseCard
            key={phase.id}
            phase={phase}
            features={phaseFeatures}
            onFeatureSelect={onFeatureSelect}
            onBuild={onBuild}
          />
        );
      })}
    </div>
  );
}

// ─── PrioritiesView ───────────────────────────────────────────────────────────

interface PrioritiesViewProps {
  features: RoadmapFeature[];
  onSelect: (f: RoadmapFeature) => void;
}

function PrioritiesView({ features, onSelect }: PrioritiesViewProps) {
  const priorities = ['must', 'should', 'could', 'wont'] as const;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 20,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
        minHeight: 0,
      }}
    >
      {priorities.map(priority => {
        const cfg = ROADMAP_PRIORITY_CONFIG[priority];
        const priorityFeatures = features.filter(f => f.priority === priority);
        return (
          <div
            key={priority}
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${cfg.border}`,
              borderRadius: 10,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Section header */}
            <div
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${cfg.border}`,
                background: cfg.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: cfg.color, opacity: 0.8 }}>
                {priorityFeatures.length}
              </span>
            </div>

            {/* Feature cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {priorityFeatures.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--text-muted)', fontSize: 12 }}>
                  No features
                </div>
              ) : (
                priorityFeatures.map(f => (
                  <FeatureCard key={f.id} feature={f} onSelect={onSelect} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RoadmapPage ─────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const serverState = useBoardServerReady();
  const { ready, timedOut } = serverState;
  const { roadmap, competitorAnalysis, loading, error, refetch } = useRoadmapData(slug!, ready);

  const [activeTab, setActiveTab] = useState<TabId>('kanban');
  const [selectedFeature, setSelectedFeature] = useState<RoadmapFeature | null>(null);
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [showAddCompetitor, setShowAddCompetitor] = useState(false);
  const [showCompetitorViewer, setShowCompetitorViewer] = useState(false);
  const [pendingConvertFeature, setPendingConvertFeature] = useState<RoadmapFeature | null>(null);
  const [epicPickerEpics, setEpicPickerEpics] = useState<Epic[] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Collect all pain points from competitors indexed by ID
  const painPointsById = useMemo(() => {
    const map = new Map<string, CompetitorPainPoint>();
    for (const c of competitorAnalysis?.competitors ?? []) {
      for (const pp of c.painPoints) {
        map.set(pp.id, pp);
      }
    }
    return map;
  }, [competitorAnalysis]);

  const selectedInsights = useMemo(() => {
    if (!selectedFeature) return [];
    return (selectedFeature.competitorInsightIds ?? [])
      .map(id => painPointsById.get(id))
      .filter((pp): pp is CompetitorPainPoint => pp != null);
  }, [selectedFeature, painPointsById]);

  // ── Handlers ──

  const handleSaveRoadmap = useCallback(async (updated: Roadmap) => {
    try {
      await roadmapApi.roadmap.save(slug!, updated);
      refetch();
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, refetch]);

  const handleAddFeature = useCallback(async (data: Omit<RoadmapFeature, 'id'>) => {
    try {
      await roadmapApi.features.add(slug!, data);
      refetch();
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, refetch]);

  const handleDeleteFeature = useCallback(async (featureId: string) => {
    try {
      await roadmapApi.features.remove(slug!, featureId);
      setSelectedFeature(null);
      refetch();
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, refetch]);

  const handleAddCompetitor = useCallback(async (competitor: Omit<Competitor, 'id'>) => {
    try {
      await roadmapApi.competitors.add(slug!, competitor);
      refetch();
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, refetch]);

  const handleConvertToTask = useCallback(async (feature: RoadmapFeature) => {
    try {
      const project = await api.projects.get(slug!);
      if (project.epics.length === 0) {
        setActionError('No epics found. Create an epic on the Board first.');
        return;
      }
      if (project.epics.length === 1) {
        const result = await roadmapApi.features.convertToTask(slug!, feature.id, project.epics[0].id);
        setSelectedFeature(result.feature);
        refetch();
      } else {
        setPendingConvertFeature(feature);
        setEpicPickerEpics(project.epics);
      }
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, refetch]);

  const handleEpicPick = useCallback(async (epicId: number) => {
    if (!pendingConvertFeature) return;
    try {
      const result = await roadmapApi.features.convertToTask(slug!, pendingConvertFeature.id, epicId);
      setSelectedFeature(result.feature);
      setPendingConvertFeature(null);
      setEpicPickerEpics(null);
      refetch();
    } catch (err) {
      setActionError(String(err));
    }
  }, [slug, pendingConvertFeature, refetch]);

  const handleGoToTask = useCallback((taskId: number) => {
    navigate(`/board/${slug}`, { state: { highlightTaskId: taskId } });
  }, [navigate, slug]);

  // ── Render ──

  if (timedOut) {
    return <BoardServerOffline serverState={serverState} />;
  }

  if (!ready || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {!ready ? 'Connecting to board server...' : 'Loading roadmap...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Failed to load roadmap</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{error}</span>
        <button
          onClick={refetch}
          style={{
            padding: '6px 14px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div style={{ height: '100%' }}>
        <RoadmapEmptyState onGenerate={() => {
          // The user should ask Claude via MCP to generate a roadmap
          // We surface a hint for now
          alert('Ask Claude to generate a roadmap:\n\nget_roadmap(project: "' + slug + '")');
        }} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <RoadmapHeader
        roadmap={roadmap}
        competitorAnalysis={competitorAnalysis}
        onAddFeature={() => setShowAddFeature(true)}
        onRefresh={refetch}
        onViewCompetitors={() => setShowCompetitorViewer(true)}
      />

      <RoadmapTabs activeTab={activeTab} onTabChange={tab => setActiveTab(tab as TabId)} />

      {/* Action error banner */}
      {actionError && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            background: 'rgba(220,38,38,0.1)',
            borderBottom: '1px solid rgba(220,38,38,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: '#dc2626' }}>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: 0 }}
          >
            {'✕'}
          </button>
        </div>
      )}

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'kanban' && (
          <RoadmapKanbanView
            roadmap={roadmap}
            onFeatureSelect={setSelectedFeature}
            onSave={handleSaveRoadmap}
          />
        )}
        {activeTab === 'phases' && (
          <PhasesView
            roadmap={roadmap}
            onFeatureSelect={setSelectedFeature}
            onBuild={handleConvertToTask}
          />
        )}
        {activeTab === 'features' && (
          <AllFeaturesView
            features={roadmap.features}
            onSelect={setSelectedFeature}
          />
        )}
        {activeTab === 'priorities' && (
          <PrioritiesView
            features={roadmap.features}
            onSelect={setSelectedFeature}
          />
        )}
      </div>

      {/* Feature detail panel */}
      {selectedFeature && (
        <FeatureDetailPanel
          feature={selectedFeature}
          competitorInsights={selectedInsights}
          onClose={() => setSelectedFeature(null)}
          onConvertToTask={handleConvertToTask}
          onGoToTask={handleGoToTask}
          onDelete={handleDeleteFeature}
        />
      )}

      {/* Dialogs */}
      <AddFeatureDialog
        phases={roadmap.phases}
        open={showAddFeature}
        onOpenChange={setShowAddFeature}
        onAdd={handleAddFeature}
      />

      <AddCompetitorDialog
        open={showAddCompetitor}
        onOpenChange={setShowAddCompetitor}
        onAdd={handleAddCompetitor}
      />

      {competitorAnalysis && (
        <CompetitorAnalysisViewer
          analysis={competitorAnalysis}
          open={showCompetitorViewer}
          onOpenChange={setShowCompetitorViewer}
          onAddCompetitor={() => { setShowCompetitorViewer(false); setShowAddCompetitor(true); }}
        />
      )}

      {/* Epic picker */}
      {epicPickerEpics && (
        <EpicPickerModal
          epics={epicPickerEpics}
          onPick={handleEpicPick}
          onCancel={() => { setEpicPickerEpics(null); setPendingConvertFeature(null); }}
        />
      )}
    </div>
  );
}
