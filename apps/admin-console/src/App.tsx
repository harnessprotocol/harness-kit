import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronDown,
  CircleGauge,
  FileCheck2,
  Fingerprint,
  GitPullRequestArrow,
  KeyRound,
  LoaderCircle,
  LogIn,
  Pause,
  Play,
  RadioTower,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, currentPrincipal, githubLoginUrl, loadAdminData, organizations } from "./api";
import type { AdminData, Artifact, Organization, Policy, Submission } from "./types";

type View = "overview" | "submissions" | "releases" | "security" | "people" | "rollouts" | "inventory" | "audit";

const navigation: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: CircleGauge },
  { id: "submissions", label: "Submissions", icon: GitPullRequestArrow },
  { id: "releases", label: "Releases", icon: FileCheck2 },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "people", label: "People & policy", icon: Users },
  { id: "rollouts", label: "Rollouts", icon: RadioTower },
  { id: "inventory", label: "Inventory & drift", icon: Boxes },
  { id: "audit", label: "Audit", icon: ScrollText },
];

function Status({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "good" | "warn" | "bad" | "live" }) {
  return <span className="status" data-tone={tone}><span aria-hidden="true" />{children}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><Fingerprint aria-hidden="true" /><p>{children}</p></div>;
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function shortDigest(value?: string): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-6)}` : "unlocked";
}

function artifactFor(data: AdminData, submission: Submission): Artifact | undefined {
  return data.artifacts.find((artifact) => artifact.id === submission.artifactId);
}

function Overview({ data }: { data: AdminData }) {
  const pending = data.submissions.filter((item) => item.status === "pending").length;
  const drift = data.inventory.reduce((sum, item) => sum + item.drift.length, 0);
  const blocking = data.artifacts.flatMap((item) => item.findings).filter((item) => item.severity === "block").length;
  const active = data.rollouts.filter((item) => item.status === "active" || item.status === "scheduled").length;
  return <>
    <PageHeader eyebrow="Control plane" title="Governance at a glance" description="A live ledger of what is proposed, approved, deployed, and drifting across the organization." />
    <div className="metrics" aria-label="Organization summary">
      <Metric value={pending} label="pending submissions" tone={pending ? "warn" : "quiet"} />
      <Metric value={blocking} label="blocking findings" tone={blocking ? "bad" : "quiet"} />
      <Metric value={active} label="active rollouts" tone={active ? "live" : "quiet"} />
      <Metric value={drift} label="drift records" tone={drift ? "warn" : "quiet"} />
    </div>
    <section className="ledger-section">
      <SectionHeading title="Recent control-plane activity" note="The newest administrative changes and client reports." />
      {data.audit.length === 0 ? <Empty>No audit events have been recorded.</Empty> : (
        <div className="activity-list">
          {data.audit.slice(-8).reverse().map((event, index) => <div className="activity-row" key={`${event.occurredAt}-${index}`}>
            <Activity size={15} aria-hidden="true" />
            <div><strong>{event.action}</strong><span>{event.actorId}</span></div>
            <time>{date(event.occurredAt)}</time>
          </div>)}
        </div>
      )}
    </section>
  </>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone: "quiet" | "warn" | "bad" | "live" }) {
  return <div className="metric" data-tone={tone}><strong>{value}</strong><span>{label}</span></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action}</header>;
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{note && <p>{note}</p>}</div>;
}

function Submissions({ organizationId, data, refresh }: PanelProps) {
  const pending = data.submissions.filter((item) => item.status === "pending");
  const [selectedId, setSelectedId] = useState(pending[0]?.id ?? "");
  const selected = data.submissions.find((item) => item.id === selectedId);
  const artifact = selected ? artifactFor(data, selected) : undefined;
  const [name, setName] = useState(artifact?.identity.name ?? "");
  const [version, setVersion] = useState(artifact?.version ?? "0.1.0");
  const [channel, setChannel] = useState(data.policy.requiredChannel ?? "stable");
  const [makePublic, setMakePublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(artifact?.identity.name ?? "");
    setVersion(artifact?.version ?? "0.1.0");
  }, [artifact?.id]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!selected || !artifact) return;
    setBusy(true); setError("");
    try {
      await api(`/v1/organizations/${organizationId}/releases`, { method: "POST", body: JSON.stringify({ artifactId: artifact.id, submissionId: selected.id, name, version, channel, public: makePublic }) });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication failed"); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Review queue" title="Submissions" description="Members propose. Publishers inspect the immutable artifact and release it under an explicit label." />
    <section className="split-workspace">
      <div className="queue" aria-label="Submission queue">
        {data.submissions.length === 0 ? <Empty>No artifacts are waiting for review.</Empty> : data.submissions.map((item) => {
          const candidate = artifactFor(data, item);
          return <button type="button" className="queue-row" data-selected={selectedId === item.id} onClick={() => setSelectedId(item.id)} key={item.id}>
            <span><strong>{candidate?.identity.name ?? item.artifactId}</strong><small>{candidate?.identity.kind} · {item.submittedBy}</small></span>
            <Status tone={item.status === "pending" ? "warn" : "good"}>{item.status}</Status>
          </button>;
        })}
      </div>
      <div className="inspector">
        {!selected || !artifact ? <Empty>Select a pending submission to inspect it.</Empty> : <>
          <SectionHeading title={artifact.identity.name} note={`${artifact.identity.source} · ${artifact.type}`} />
          <dl className="facts"><div><dt>Digest</dt><dd><code>{shortDigest(artifact.digest)}</code></dd></div><div><dt>Proposed version</dt><dd>{artifact.version}</dd></div><div><dt>Visibility</dt><dd>{artifact.visibility}</dd></div><div><dt>Findings</dt><dd>{artifact.findings.length}</dd></div></dl>
          <form className="editor" onSubmit={publish}>
            <label>Release name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <div className="field-pair"><label>Semantic version<input value={version} onChange={(event) => setVersion(event.target.value)} required /></label><label>Channel<input value={channel} onChange={(event) => setChannel(event.target.value)} required /></label></div>
            <label className="check"><input type="checkbox" checked={makePublic} onChange={(event) => setMakePublic(event.target.checked)} /> Publish publicly</label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy || selected.status !== "pending"}>{busy ? "Publishing…" : selected.status === "pending" ? "Publish immutable release" : "Already published"}</button>
          </form>
        </>}
      </div>
    </section>
  </>;
}

function Releases({ data }: { data: AdminData }) {
  return <>
    <PageHeader eyebrow="Artifact registry" title="Releases" description="Semantic labels may move under administrator control; every prior digest remains addressable." />
    <section className="ledger-section">
      {data.releases.length === 0 ? <Empty>No releases have been published.</Empty> : <div className="data-table" role="table" aria-label="Releases">
        <div className="table-head" role="row"><span>Name</span><span>Version</span><span>Channel</span><span>Digest</span><span>Access</span></div>
        {data.releases.map((release) => <div className="table-row" role="row" key={release.id}><strong>{release.name}</strong><span>{release.version}</span><span>{release.channel}</span><code title={release.digest}>{shortDigest(release.digest)}</code><Status tone={release.visibility === "public" ? "live" : "quiet"}>{release.visibility}</Status></div>)}
      </div>}
    </section>
  </>;
}

function Security({ organizationId, data, refresh }: PanelProps) {
  const findings = data.artifacts.flatMap((artifact) => artifact.findings.map((finding) => ({ artifact, finding })));
  const [reason, setReason] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [artifactDigest, setArtifactDigest] = useState("");
  const [exceptionId, setExceptionId] = useState("");
  const [error, setError] = useState("");
  async function grant(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const created = await api<{ id: string }>(`/v1/organizations/${organizationId}/security-exceptions`, {
        method: "POST",
        body: JSON.stringify({ artifactDigest, findingCodes: selectedCodes, reason }),
      });
      setExceptionId(created.id); setReason(""); setSelectedCodes([]); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Exception failed"); }
  }
  return <>
    <PageHeader eyebrow="Policy gate" title="Security findings" description="Blocking findings stop publication unless an administrator records a scoped, audited exception." />
    <section className="ledger-section security-ledger">
      {findings.length === 0 ? <Empty>No artifact security findings are open.</Empty> : findings.map(({ artifact, finding }, index) => <label className="finding-row" key={`${artifact.id}-${finding.code}-${index}`}>
        <input type="checkbox" checked={artifactDigest === artifact.digest && selectedCodes.includes(finding.code)} onChange={(event) => {
          if (event.target.checked) {
            if (artifactDigest && artifactDigest !== artifact.digest) setSelectedCodes([finding.code]);
            else setSelectedCodes([...new Set([...selectedCodes, finding.code])]);
            setArtifactDigest(artifact.digest);
          } else {
            const next = selectedCodes.filter((code) => code !== finding.code);
            setSelectedCodes(next);
            if (next.length === 0) setArtifactDigest("");
          }
        }} />
        <AlertTriangle size={17} aria-hidden="true" />
        <span><strong>{finding.code}</strong><small>{artifact.identity.name} · {finding.path ?? "manifest"}</small></span>
        <p>{finding.detail}</p><Status tone={finding.severity === "block" ? "bad" : "warn"}>{finding.severity}</Status>
      </label>)}
    </section>
    <form className="exception-bar" onSubmit={grant}>
      <KeyRound aria-hidden="true" />
      <label>Artifact digest<input value={artifactDigest} onChange={(event) => setArtifactDigest(event.target.value)} placeholder="sha256:…" pattern="sha256:[a-f0-9]{64}" required /></label>
      <label>Finding codes<input value={selectedCodes.join(", ")} onChange={(event) => setSelectedCodes(event.target.value.split(",").map((code) => code.trim()).filter(Boolean))} placeholder="dangerous-instruction" required /></label>
      <label>Administrator exception<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this safe?" required /></label>
      <button disabled={selectedCodes.length === 0 || !artifactDigest}>Record exception</button>
      {error && <p className="form-error">{error}</p>}
      {exceptionId && <p className="save-note">Exception ID: <code>{exceptionId}</code>. Give this scoped ID to the submitter.</p>}
    </form>
  </>;
}

function PeoplePolicy({ organizationId, data, refresh }: PanelProps) {
  const [policy, setPolicy] = useState<Policy>(data.policy);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => setPolicy(data.policy), [data.policy]);

  async function role(userId: string, value: string) {
    await api(`/v1/organizations/${organizationId}/members`, { method: "PUT", body: JSON.stringify({ userId, role: value }) });
    await refresh();
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { await api(`/v1/organizations/${organizationId}/policy`, { method: "PUT", body: JSON.stringify(policy) }); setNotice("Policy saved and audit logged."); await refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Save failed"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader eyebrow="Authority" title="People & policy" description="Roles control publication; organization policy is the ceiling lower scopes cannot widen." />
    <section className="ledger-section">
      <SectionHeading title="Members" note={`${data.members.length} enrolled identities`} />
      <div className="member-list">{data.members.map((member) => <div className="member-row" key={member.userId}><span className="avatar" aria-hidden="true">{member.userId.slice(0, 2).toUpperCase()}</span><strong>{member.userId}</strong><label><span className="sr-only">Role for {member.userId}</span><select value={member.role} onChange={(event) => void role(member.userId, event.target.value)}><option value="member">Member</option><option value="publisher">Publisher</option><option value="administrator">Administrator</option></select><ChevronDown aria-hidden="true" /></label></div>)}</div>
    </section>
    <form className="policy-editor" onSubmit={save}>
      <SectionHeading title="Organization policy" note="Applied to capture, publication, and client update decisions." />
      <div className="field-pair"><label>Required channel<input value={policy.requiredChannel ?? ""} onChange={(event) => setPolicy({ ...policy, requiredChannel: event.target.value || undefined })} placeholder="stable" /></label><label>Blocking finding codes<input value={(policy.blockingFindingCodes ?? []).join(", ")} onChange={(event) => setPolicy({ ...policy, blockingFindingCodes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="dangerous-instruction, executable-hook" /></label></div>
      <div className="field-pair"><label>Allowed sources<input value={(policy.allowedSources ?? []).join(", ")} onChange={(event) => setPolicy({ ...policy, allowedSources: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="github.com/acme/*" /></label><label>Denied sources<input value={(policy.deniedSources ?? []).join(", ")} onChange={(event) => setPolicy({ ...policy, deniedSources: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="github.com/unknown/*" /></label></div>
      <label className="check"><input type="checkbox" checked={policy.automaticUpdates ?? false} onChange={(event) => setPolicy({ ...policy, automaticUpdates: event.target.checked })} /> Mandate automatic client updates</label>
      <div className="form-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save policy"}</button>{notice && <span className="save-note">{notice}</span>}</div>
    </form>
  </>;
}

function Rollouts({ organizationId, data, refresh }: PanelProps) {
  const [releaseId, setReleaseId] = useState(data.releases[0]?.id ?? "");
  const [effectiveAt, setEffectiveAt] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    await api(`/v1/organizations/${organizationId}/rollouts`, { method: "POST", body: JSON.stringify({ releaseId, ...(effectiveAt ? { effectiveAt: new Date(effectiveAt).toISOString() } : {}) }) });
    await refresh();
  }
  async function change(id: string, status: "active" | "paused") {
    await api(`/v1/organizations/${organizationId}/rollouts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await refresh();
  }
  return <>
    <PageHeader eyebrow="Staged delivery" title="Rollouts" description="Move immutable release digests through rings, pause immediately, and restore last-known-good state after failed health checks." />
    <form className="rollout-create" onSubmit={create}><label>Release<select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} required>{data.releases.map((release) => <option value={release.id} key={release.id}>{release.name} {release.version} · {shortDigest(release.digest)}</option>)}</select></label><label>Effective date<input type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} /></label><button className="primary" disabled={!releaseId}>Stage rollout</button></form>
    <section className="ledger-section rollout-list">
      {data.rollouts.length === 0 ? <Empty>No rollouts are scheduled.</Empty> : data.rollouts.map((rollout) => <article className="rollout-row" key={rollout.id}>
        <div><Status tone={rollout.status === "active" ? "live" : rollout.status === "rolled-back" ? "bad" : "quiet"}>{rollout.status}</Status><strong>{data.releases.find((release) => release.id === rollout.releaseId)?.name ?? rollout.releaseId}</strong><code>{shortDigest(rollout.releaseDigest)}</code></div>
        <div className="ring-track" aria-label="Rollout rings">{rollout.rings.map((ring) => <span style={{ width: `${Math.max(ring.percentage, 8)}%` }} key={ring.name}>{ring.name}<small>{ring.percentage}%</small></span>)}</div>
        <dl className="rollout-facts"><div><dt>Effective</dt><dd>{date(rollout.effectiveAt)}</dd></div><div><dt>Healthy</dt><dd>{rollout.deviceReports.filter((item) => item.status === "healthy").length}</dd></div><div><dt>Failed</dt><dd>{rollout.deviceReports.filter((item) => item.status === "failed").length}</dd></div></dl>
        <button className="icon-action" onClick={() => void change(rollout.id, rollout.status === "paused" ? "active" : "paused")} aria-label={`${rollout.status === "paused" ? "Resume" : "Pause"} rollout`}>{rollout.status === "paused" ? <Play /> : <Pause />}</button>
      </article>)}
    </section>
  </>;
}

function Inventory({ data }: { data: AdminData }) {
  const targetCount = new Set(data.inventory.flatMap((item) => item.targets)).size;
  const driftCount = data.inventory.reduce((sum, item) => sum + item.drift.length, 0);
  return <>
    <PageHeader eyebrow="Client-redacted telemetry" title="Inventory & drift" description="Parsed assignments, revisions, native target state, and drift only—never skill bodies, prompts, secrets, or environment contents." />
    <div className="inventory-summary"><span><strong>{data.inventory.length}</strong> installations</span><span><strong>{targetCount}</strong> target types</span><span><strong>{driftCount}</strong> drift records</span></div>
    <section className="ledger-section inventory-list">
      {data.inventory.length === 0 ? <Empty>No enrolled clients have uploaded an inventory snapshot.</Empty> : data.inventory.map((inventory) => <article key={`${inventory.installationId}-${inventory.capturedAt}`}>
        <div className="inventory-title"><span className="machine"><CircleGauge aria-hidden="true" />{inventory.installationId}</span><time>{date(inventory.capturedAt)}</time><Status tone={inventory.drift.length ? "warn" : "good"}>{inventory.drift.length ? `${inventory.drift.length} drift` : "in sync"}</Status></div>
        <div className="target-line">{inventory.targets.map((target) => <span key={target}>{target}</span>)}</div>
        {inventory.drift.map((drift, index) => <div className="drift-row" key={`${drift.target}-${drift.path}-${index}`}><AlertTriangle aria-hidden="true" /><strong>{drift.target}</strong><code>{drift.path}</code><span>{drift.classification}</span></div>)}
      </article>)}
    </section>
  </>;
}

function Audit({ data }: { data: AdminData }) {
  return <>
    <PageHeader eyebrow="Immutable history" title="Audit" description="Every policy change, publication, exception, rollout control, and inventory upload remains attributable." />
    <section className="ledger-section audit-list">
      {data.audit.length === 0 ? <Empty>No audit events have been recorded.</Empty> : data.audit.slice().reverse().map((event, index) => <article key={`${event.occurredAt}-${index}`}><time>{date(event.occurredAt)}</time><Status>{event.action}</Status><strong>{event.actorId}</strong><code>{JSON.stringify(event.detail)}</code></article>)}
    </section>
  </>;
}

function DeviceAuthorization({ principal }: { principal: string }) {
  const initialCode = new URLSearchParams(window.location.search).get("userCode") ?? "";
  const [userCode, setUserCode] = useState(initialCode.toUpperCase());
  const [state, setState] = useState<"ready" | "approving" | "approved" | "error">("ready");
  const [message, setMessage] = useState("");
  async function approve(event: FormEvent) {
    event.preventDefault(); setState("approving"); setMessage("");
    try {
      await api("/v1/auth/device/authorize", { method: "POST", body: JSON.stringify({ userCode }) });
      setState("approved");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Authorization failed");
      setState("error");
    }
  }
  return <main className="device-auth">
    <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
    <p>Harness Kit Registry</p>
    {state === "approved" ? <>
      <ShieldCheck className="approval-icon" aria-hidden="true" />
      <h1>Device authorized</h1>
      <span>You can return to Harness Kit. The short-lived client session will complete there.</span>
    </> : <>
      <h1>Authorize a device</h1>
      <span>Signed in as <strong>{principal}</strong>. Confirm the code shown by Harness Kit before allowing this short-lived session.</span>
      <form onSubmit={approve}>
        <label>Device code<input value={userCode} onChange={(event) => setUserCode(event.target.value.toUpperCase())} autoComplete="one-time-code" maxLength={10} pattern="[A-Fa-f0-9]{10}" placeholder="A1B2C3D4E5" required autoFocus /></label>
        <button className="primary" disabled={state === "approving" || userCode.length !== 10}>{state === "approving" ? "Authorizing…" : "Authorize device"}</button>
      </form>
      {state === "error" && <p className="form-error">{message}</p>}
      <small>Only approve a code you initiated. Device sessions expire automatically.</small>
    </>}
  </main>;
}

interface PanelProps { organizationId: string; data: AdminData; refresh: () => Promise<void> }

export function App() {
  const [view, setView] = useState<View>("overview");
  const [principal, setPrincipal] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "anonymous" | "error">("loading");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!organizationId || !principal) return;
    setData(await loadAdminData(organizationId, principal));
  }, [organizationId, principal]);

  useEffect(() => {
    void (async () => {
      try {
        const me = await currentPrincipal();
        const available = await organizations();
        setPrincipal(me.userId); setOrgs(available);
        const remembered = window.localStorage.getItem("hk-admin-organization");
        setOrganizationId(available.find((org) => org.id === remembered)?.id ?? available[0]?.id ?? "");
        setStatus("ready");
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) setStatus("anonymous");
        else { setError(cause instanceof Error ? cause.message : "Console unavailable"); setStatus("error"); }
      }
    })();
  }, []);

  useEffect(() => {
    if (!organizationId) { setData(null); return; }
    window.localStorage.setItem("hk-admin-organization", organizationId);
    setData(null);
    void refresh().catch((cause) => { setError(cause instanceof Error ? cause.message : "Could not load organization"); setStatus("error"); });
  }, [organizationId, refresh]);

  const selectedOrganization = useMemo(() => orgs.find((org) => org.id === organizationId), [orgs, organizationId]);
  const role = data?.members.find((member) => member.userId === principal)?.role ?? "member";
  const visibleNavigation = useMemo(() => role === "administrator"
    ? navigation
    : navigation.filter((item) => ["overview", "submissions", "releases", "inventory"].includes(item.id)), [role]);

  useEffect(() => {
    if (data && !visibleNavigation.some((item) => item.id === view)) setView("overview");
  }, [data, view, visibleNavigation]);

  if (status === "loading") return <main className="center-state"><LoaderCircle className="spin" aria-hidden="true" /><h1>Reading the control plane</h1><p>Authenticating and loading organization state…</p></main>;
  if (status === "anonymous") return <main className="sign-in"><div className="brand-mark" aria-hidden="true"><span /><span /><span /></div><p>Harness Kit Registry</p><h1>Your harness estate,<br />under explicit control.</h1><span>Review what developers propose, publish immutable releases, and stage safe updates without collecting their source material.</span><a className="primary" href={githubLoginUrl()}><LogIn aria-hidden="true" />Continue with GitHub</a><small>Short-lived session · organization artifacts private by default</small></main>;
  if (status === "error") return <main className="center-state"><AlertTriangle aria-hidden="true" /><h1>Control plane unavailable</h1><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></main>;
  if (window.location.pathname === "/device" && principal) return <DeviceAuthorization principal={principal} />;
  if (orgs.length === 0) return <main className="center-state"><Boxes aria-hidden="true" /><h1>No organization yet</h1><p>Create one with <code>harness-kit org create</code>, then return here.</p></main>;

  return <div className="shell">
    <aside>
      <a className="brand" href="/" aria-label="Harness Kit administration"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Harness Kit<small>Registry control plane</small></span></a>
      <label className="org-switcher"><span>Organization</span><select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{orgs.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}</select><ChevronDown aria-hidden="true" /></label>
      <nav aria-label="Administration">{visibleNavigation.map((item) => { const Icon = item.icon; return <button type="button" data-active={view === item.id} onClick={() => setView(item.id)} key={item.id}><Icon aria-hidden="true" />{item.label}{item.id === "submissions" && data && data.submissions.some((entry) => entry.status === "pending") && <span className="nav-count">{data.submissions.filter((entry) => entry.status === "pending").length}</span>}</button>; })}</nav>
      <footer><span className="avatar">{principal?.slice(0, 2).toUpperCase()}</span><span><strong>{principal}</strong><small>{selectedOrganization?.slug}</small></span></footer>
    </aside>
    <main className="workspace">
      {!data ? <div className="loading-inline"><LoaderCircle className="spin" aria-hidden="true" />Loading {selectedOrganization?.name}…</div> : <>
        {view === "overview" && <Overview data={data} />}
        {view === "submissions" && <Submissions organizationId={organizationId} data={data} refresh={refresh} />}
        {view === "releases" && <Releases data={data} />}
        {view === "security" && <Security organizationId={organizationId} data={data} refresh={refresh} />}
        {view === "people" && <PeoplePolicy organizationId={organizationId} data={data} refresh={refresh} />}
        {view === "rollouts" && <Rollouts organizationId={organizationId} data={data} refresh={refresh} />}
        {view === "inventory" && <Inventory data={data} />}
        {view === "audit" && <Audit data={data} />}
      </>}
    </main>
  </div>;
}
