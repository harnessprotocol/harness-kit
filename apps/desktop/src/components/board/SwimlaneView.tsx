import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Epic, Task, TaskStatus } from "../../lib/board-api";
import { COLUMN_META, COLUMNS } from "../../lib/board-columns";
import { SortableTaskCard } from "./SortableTaskCard";
import { Tooltip } from "./Tooltip";

// Individual droppable cell in the swimlane grid
function SwimCell({
  epicId,
  status,
  tasks,
  onTaskClick,
  repoUrl,
}: {
  epicId: number;
  status: TaskStatus;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  repoUrl?: string;
}) {
  const droppableId = `swim-${epicId}-${status}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const taskIds = tasks.map((t) => `task-${t.id}`);

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 200,
        minHeight: 80,
        background: isOver ? "var(--bg-elevated)" : "transparent",
        borderRadius: 6,
        border: `1px solid ${isOver ? "var(--accent)" : "var(--border-subtle)"}`,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {tasks.length === 0 ? (
          <div
            style={{
              fontSize: 11,
              color: isOver ? "var(--accent)" : "var(--text-muted)",
              textAlign: "center",
              padding: "16px 0",
              fontStyle: "italic",
            }}
          >
            {isOver ? "Drop here" : "\u2014"}
          </div>
        ) : (
          tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick?.(task)}
              repoUrl={repoUrl}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

interface Props {
  epics: Epic[];
  onTaskClick?: (task: Task) => void;
  onAddTask?: (status: string, epicId: number) => void;
  repoUrl?: string;
}

export function SwimlaneView({ epics, onTaskClick, onAddTask, repoUrl }: Props) {
  const activeEpics = epics.filter((e) => e.status === "active");

  if (activeEpics.length === 0) {
    return (
      <div style={{ padding: 40, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
        No active epics. Create one with <code>create_epic</code>.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, padding: 20 }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 900 }}>
        {/* Column headers */}
        <thead>
          <tr>
            {/* Epic label column */}
            <th
              style={{
                width: 160,
                minWidth: 160,
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderBottom: "1px solid var(--border-subtle)",
                position: "sticky",
                left: 0,
                background: "var(--bg-base)",
                zIndex: 2,
              }}
            >
              Epic
            </th>
            {COLUMNS.map((col) => (
              <th
                key={col}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: COLUMN_META[col].color,
                      flexShrink: 0,
                    }}
                  />
                  <Tooltip text={COLUMN_META[col].tooltip} position="bottom">
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {COLUMN_META[col].label}
                    </span>
                  </Tooltip>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Epic rows */}
        <tbody>
          {activeEpics.map((epic, rowIdx) => {
            const tasksByStatus = Object.fromEntries(
              COLUMNS.map((col) => [
                col,
                epic.tasks
                  .filter((t) => t.status === col)
                  .map((t) => ({ ...t, epic_id: epic.id, epic_name: epic.name })),
              ]),
            ) as Record<TaskStatus, Task[]>;

            return (
              <tr key={epic.id}>
                {/* Epic label */}
                <td
                  style={{
                    padding: "10px 12px",
                    verticalAlign: "top",
                    borderBottom:
                      rowIdx < activeEpics.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    position: "sticky",
                    left: 0,
                    background: "var(--bg-base)",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: "var(--text-primary)",
                      marginBottom: 4,
                    }}
                  >
                    {epic.name}
                  </div>
                  {epic.description && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                      {epic.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                    {epic.tasks.length} task{epic.tasks.length !== 1 ? "s" : ""}
                  </div>
                </td>

                {/* Status cells */}
                {COLUMNS.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: "8px",
                      verticalAlign: "top",
                      borderBottom:
                        rowIdx < activeEpics.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    }}
                  >
                    <SwimCell
                      epicId={epic.id}
                      status={col}
                      tasks={tasksByStatus[col] ?? []}
                      onTaskClick={onTaskClick}
                      repoUrl={repoUrl}
                    />
                    {col === "planning" && (
                      <Tooltip text={`Create a new task in ${epic.name}`} position="top">
                        <button
                          onClick={() => onAddTask?.(col, epic.id)}
                          style={{
                            marginTop: 6,
                            width: "100%",
                            padding: "4px",
                            background: "transparent",
                            border: "1px dashed var(--border-subtle)",
                            borderRadius: 4,
                            color: "var(--text-muted)",
                            fontSize: 11,
                            cursor: "pointer",
                            transition: "all 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                            (e.currentTarget as HTMLElement).style.color = "var(--accent)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor =
                              "var(--border-subtle)";
                            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                          }}
                        >
                          + Add
                        </button>
                      </Tooltip>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
