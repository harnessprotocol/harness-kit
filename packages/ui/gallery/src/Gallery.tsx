import { useEffect, useState } from "react";
import {
  Server,
  Layers,
  GitCompare,
  Activity,
  Store,
  Settings,
  Search,
  FolderX,
} from "lucide-react";
import {
  Button,
  Sidebar,
  NavGroupLabel,
  NavItem,
  SummaryStrip,
  Table,
  StatusChip,
  DiffViewer,
  Modal,
  Toast,
  ToastViewport,
  EmptyState,
  Stat,
  Card,
  Input,
  Select,
  Toggle,
  CommandPalette,
  type Command,
  type ToastItem,
} from "../../src/index";

type HarnessRow = {
  id: string;
  name: string;
  version: string;
  global: "sync" | "drift" | "none";
  projectA: "sync" | "drift" | "none";
  projectB: "sync" | "drift" | "none";
};

const HARNESS_ROWS: HarnessRow[] = [
  { id: "claude", name: "Claude Code", version: "2.1.4", global: "sync", projectA: "drift", projectB: "sync" },
  { id: "cursor", name: "Cursor", version: "1.8.0", global: "sync", projectA: "sync", projectB: "drift" },
  { id: "copilot", name: "GitHub Copilot", version: "0.24.1", global: "drift", projectA: "none", projectB: "sync" },
  { id: "windsurf", name: "Windsurf", version: "1.2.0", global: "none", projectA: "none", projectB: "none" },
];

function cellChip(status: HarnessRow["global"]) {
  if (status === "sync") return <StatusChip variant="success">In sync</StatusChip>;
  if (status === "drift") return <StatusChip variant="warning">Drift 3</StatusChip>;
  return <StatusChip variant="subtle">Not configured</StatusChip>;
}

const DIFF_LINES = [
  { op: "context" as const, content: "  \"permissions\": {" },
  { op: "remove" as const, content: "-   \"allow\": [\"Bash(git *)\"]" },
  { op: "add" as const, content: "+   \"allow\": [\"Bash(git *)\", \"Bash(pnpm *)\"]" },
  { op: "context" as const, content: "  }," },
];

const NAV_SECTIONS = [
  { id: "fleet", label: "Fleet", icon: <Server size={16} strokeWidth={1.7} /> },
  { id: "configure", label: "Configure", icon: <Layers size={16} strokeWidth={1.7} /> },
  { id: "drift", label: "Drift", icon: <GitCompare size={16} strokeWidth={1.7} />, badge: <StatusChip variant="danger" hideDot>3</StatusChip> },
  { id: "comparator", label: "Comparator", icon: <Activity size={16} strokeWidth={1.7} /> },
  { id: "observatory", label: "Observatory", icon: <Activity size={16} strokeWidth={1.7} /> },
  { id: "marketplace", label: "Marketplace", icon: <Store size={16} strokeWidth={1.7} /> },
];

const TOASTS: ToastItem[] = [
  { id: "t1", title: "Recompiled 4 configs", variant: "success" },
  { id: "t2", title: "2 harnesses have drifted", message: "Review changes in the Drift tab.", variant: "warning" },
];

const COMMANDS: Command[] = [
  { id: "ask-ai", label: "Ask AI", group: "Actions", hint: "Ollama chat", run: () => {} },
  { id: "toggle-theme", label: "Toggle light / dark theme", group: "Actions", run: () => {} },
  { id: "nav-fleet", label: "Go to Fleet", group: "Navigate", run: () => {} },
  { id: "nav-drift", label: "Go to Drift", group: "Navigate", run: () => {} },
  { id: "nav-configure", label: "Go to Configure", group: "Navigate", run: () => {} },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 650,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--fg-subtle)",
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;
}

export function Gallery() {
  const [dark, setDark] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [activeNav, setActiveNav] = useState("fleet");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base)" }}>
      <Sidebar>
        <div style={{ padding: "14px 16px", fontSize: 13, fontWeight: 650, color: "var(--fg-base)" }}>
          Harness Kit
        </div>
        <NavGroupLabel>Workspace</NavGroupLabel>
        {NAV_SECTIONS.map((s) => (
          <NavItem
            key={s.id}
            icon={s.icon}
            active={activeNav === s.id}
            badge={"badge" in s ? s.badge : undefined}
            onClick={() => setActiveNav(s.id)}
          >
            {s.label}
          </NavItem>
        ))}
        <div style={{ marginTop: "auto" }}>
          <NavGroupLabel>&nbsp;</NavGroupLabel>
          <NavItem icon={<Settings size={16} strokeWidth={1.7} />}>Settings</NavItem>
        </div>
      </Sidebar>

      <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1100, background: "var(--bg-base)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--fg-base)", margin: 0 }}>
              Component Gallery
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--fg-muted)", margin: "4px 0 0" }}>
              Direction A "Instrument" — every packages/ui component in realistic states.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setDark((d) => !d)}>
            {dark ? "Switch to light" : "Switch to dark"}
          </Button>
        </div>

        <Section title="Buttons">
          <Row>
            <Button variant="primary">Recompile all</Button>
            <Button variant="ghost">Explore read-only</Button>
            <Button variant="danger">Remove harness</Button>
            <Button variant="primary" size="sm">Small primary</Button>
            <Button variant="ghost" size="sm">Small ghost</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </Row>
        </Section>

        <Section title="Summary strip">
          <SummaryStrip
            cells={[
              { id: "harnesses", label: "Harnesses", value: "5" },
              { id: "projects", label: "Projects tracked", value: "3" },
              { id: "drifted", label: "Drifted", value: "4 configs", tone: "warning" },
              { id: "coverage", label: "Coverage", value: "82%", tone: "accent" },
              { id: "compiled", label: "Last compiled", value: "2m ago" },
            ]}
          />
        </Section>

        <Section title="Matrix / Table">
          <Table<HarnessRow>
            rows={HARNESS_ROWS}
            rowKey={(r) => r.id}
            columns={[
              {
                id: "name",
                header: "Harness",
                render: (r) => (
                  <span style={{ fontWeight: 550 }}>
                    {r.name} <span style={{ color: "var(--fg-subtle)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.version}</span>
                  </span>
                ),
              },
              { id: "global", header: "Global", render: (r) => cellChip(r.global) },
              { id: "projectA", header: "project-a", render: (r) => cellChip(r.projectA) },
              { id: "projectB", header: "project-b", render: (r) => cellChip(r.projectB) },
            ]}
          />
        </Section>

        <Section title="Status chips">
          <Row>
            <StatusChip variant="success">In sync</StatusChip>
            <StatusChip variant="warning">Drift 3</StatusChip>
            <StatusChip variant="danger">Conflict</StatusChip>
            <StatusChip variant="subtle">Not installed</StatusChip>
          </Row>
        </Section>

        <Section title="Diff viewer">
          <DiffViewer lines={DIFF_LINES} />
        </Section>

        <Section title="Stat + Card">
          <Row>
            <Stat label="Harnesses found" value="5" sub="on this machine" />
            <Stat label="Conflicts" value="2" accent="var(--danger)" />
            <Stat label="Overlap" value="6" accent="var(--warning)" />
          </Row>
          <Card interactive style={{ maxWidth: 360 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Card title</div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>
              Borderless surface — separation via elevation + shadow, never an outline.
            </div>
          </Card>
        </Section>

        <Section title="Form controls">
          <Row>
            <Input label="Harness name" placeholder="e.g. claude-code" style={{ width: 220 }} />
            <Select
              label="Scope"
              style={{ width: 180 }}
              options={[
                { value: "global", label: "Global" },
                { value: "project", label: "Project" },
              ]}
            />
            <div className="hk-field">
              <span className="hk-label">Enabled</span>
              <Toggle checked={toggleOn} onChange={setToggleOn} aria-label="Enabled" />
            </div>
          </Row>
          <Input label="With error" error helperText="This field is required" style={{ width: 260 }} />
        </Section>

        <Section title="Empty state">
          <EmptyState
            icon={<FolderX size={32} strokeWidth={1.5} />}
            title="No harnesses configured yet"
            description="We read the config you already have — no authoring required."
            action={<Button variant="primary">Scan this machine</Button>}
          />
        </Section>

        <Section title="Modal">
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Fix drift in claude-code"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Apply fix
                </Button>
              </>
            }
          >
            <p style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.6 }}>
              This will update <code>.claude/settings.json</code> to match your source of truth.
              Nothing is written until you confirm.
            </p>
          </Modal>
        </Section>

        <Section title="Toast">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
            {TOASTS.map((t) => (
              <Toast key={t.id} toast={t} />
            ))}
          </div>
        </Section>

        <Section title="Command palette">
          <Button variant="ghost" onClick={() => setPaletteOpen(true)}>
            <Search size={14} strokeWidth={1.7} /> Open command palette (⌘K)
          </Button>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={COMMANDS} />
        </Section>
      </main>

      <ToastViewport toasts={[]} />
    </div>
  );
}
