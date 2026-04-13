import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RoadmapFeature } from "../../lib/roadmap-types";
import { FeatureCard } from "./FeatureCard";

interface Props {
  feature: RoadmapFeature;
  onSelect: (f: RoadmapFeature) => void;
}

export function SortableFeatureCard({ feature, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `feature-${feature.id}`,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      {...attributes}
      {...listeners}
    >
      <FeatureCard feature={feature} onSelect={onSelect} isDragging={isDragging} />
    </div>
  );
}
