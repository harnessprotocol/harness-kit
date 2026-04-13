import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { ROADMAP_COLUMNS } from "../../lib/roadmap-constants";
import type { Roadmap, RoadmapFeature, RoadmapFeatureStatus } from "../../lib/roadmap-types";
import { FeatureCard } from "./FeatureCard";
import { SortableFeatureCard } from "./SortableFeatureCard";

interface Props {
  roadmap: Roadmap;
  onFeatureSelect: (f: RoadmapFeature) => void;
  onSave: (roadmap: Roadmap) => void;
}

interface ColumnProps {
  status: RoadmapFeatureStatus;
  label: string;
  color: string;
  features: RoadmapFeature[];
  onFeatureSelect: (f: RoadmapFeature) => void;
}

function DroppableFeatureColumn({ status, label, color, features, onFeatureSelect }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  const featureIds = features.map((f) => `feature-${f.id}`);

  return (
    <div
      style={{
        minWidth: 220,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: isOver ? "var(--bg-elevated)" : "var(--bg-surface)",
        borderRadius: 10,
        border: `1px solid ${isOver ? "var(--accent)" : "var(--border-subtle)"}`,
        overflow: "hidden",
        maxHeight: "100%",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {/* Column header */}
      <div
        style={{
          padding: "12px 14px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{label}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            borderRadius: 10,
            padding: "1px 7px",
          }}
        >
          {features.length}
        </span>
      </div>

      {/* Feature list — droppable zone */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 80,
        }}
      >
        <SortableContext items={featureIds} strategy={verticalListSortingStrategy}>
          {features.length === 0 ? (
            <div
              style={{
                padding: "24px 12px",
                textAlign: "center",
                color: isOver ? "var(--accent)" : "var(--text-muted)",
                fontSize: 12,
                borderRadius: 6,
                border: `1px dashed ${isOver ? "var(--accent)" : "var(--border-subtle)"}`,
                transition: "all 0.15s",
              }}
            >
              {isOver ? "Drop here" : "No features"}
            </div>
          ) : (
            features.map((feature) => (
              <SortableFeatureCard key={feature.id} feature={feature} onSelect={onFeatureSelect} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function RoadmapKanbanView({ roadmap, onFeatureSelect, onSave }: Props) {
  const [activeFeature, setActiveFeature] = useState<RoadmapFeature | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const featuresByStatus = useMemo(() => {
    const map: Record<RoadmapFeatureStatus, RoadmapFeature[]> = {
      backlog: [],
      planning: [],
      in_progress: [],
      done: [],
    };
    for (const f of roadmap.features) {
      if (map[f.status]) {
        map[f.status].push(f);
      } else {
        map["backlog"].push(f);
      }
    }
    return map;
  }, [roadmap.features]);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id).replace("feature-", "");
    const feature = roadmap.features.find((f) => f.id === id);
    if (feature) setActiveFeature(feature);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveFeature(null);
    const { active, over } = event;
    if (!over) return;

    const featureId = String(active.id).replace("feature-", "");
    let targetStatus: RoadmapFeatureStatus | null = null;

    const overId = String(over.id);
    if (overId.startsWith("col-")) {
      targetStatus = overId.replace("col-", "") as RoadmapFeatureStatus;
    } else if (overId.startsWith("feature-")) {
      const targetFeatureId = overId.replace("feature-", "");
      const targetFeature = roadmap.features.find((f) => f.id === targetFeatureId);
      targetStatus = targetFeature?.status ?? null;
    }

    if (!targetStatus) return;

    const feature = roadmap.features.find((f) => f.id === featureId);
    if (!feature || feature.status === targetStatus) return;

    const updatedFeatures = roadmap.features.map((f) =>
      f.id === featureId ? { ...f, status: targetStatus as RoadmapFeatureStatus } : f,
    );
    onSave({ ...roadmap, features: updatedFeatures });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 16,
          padding: 20,
          overflowX: "auto",
          overflowY: "hidden",
          alignItems: "flex-start",
          minHeight: 0,
        }}
      >
        {ROADMAP_COLUMNS.map((col) => (
          <DroppableFeatureColumn
            key={col.id}
            status={col.id}
            label={col.label}
            color={col.color}
            features={featuresByStatus[col.id] ?? []}
            onFeatureSelect={onFeatureSelect}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeFeature ? (
          <div style={{ opacity: 0.85, transform: "rotate(1.5deg)" }}>
            <FeatureCard feature={activeFeature} onSelect={() => {}} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
