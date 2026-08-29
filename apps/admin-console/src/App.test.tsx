import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const fixture = {
  members: [{ userId: "octocat", role: "administrator" }],
  artifacts: [{ id: "artifact-1", type: "capsule", digest: "sha256:1234567890abcdef", identity: { kind: "skill", source: "acme/tools", name: "review" }, version: "1.2.0", visibility: "private", findings: [] }],
  submissions: [{ id: "submission-1", artifactId: "artifact-1", status: "pending", submittedBy: "developer" }],
  releases: [{ id: "org:review:1.1.0", artifactId: "artifact-1", name: "review", version: "1.1.0", digest: "sha256:previous", channel: "stable", visibility: "private" }],
  policy: { requiredChannel: "stable", automaticUpdates: false },
  rollouts: [], inventory: [],
  audit: [{ actorId: "octocat", action: "policy.updated", detail: {}, occurredAt: "2026-08-28T12:00:00.000Z" }],
};

describe("organization console", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/v1/auth/me")) return Response.json({ userId: "octocat", expiresAt: "2026-08-28T13:00:00.000Z" });
      if (path.endsWith("/v1/organizations")) return Response.json([{ id: "org-1", slug: "acme", name: "Acme" }]);
      const key = Object.keys(fixture).find((name) => path.endsWith(`/org-1/${name}`));
      if (key) return Response.json(fixture[key as keyof typeof fixture]);
      if (path.endsWith("/org-1/releases") && init?.method === "POST") return Response.json({}, { status: 201 });
      return Response.json({ message: "not found" }, { status: 404 });
    }));
  });

  it("loads governance metrics and navigates to the submission inspector", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Governance at a glance" })).toBeInTheDocument();
    expect(screen.getByText("pending submissions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /submissions/i }));
    expect(screen.getByRole("heading", { name: "Submissions" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("review")).toBeInTheDocument();
  });

  it("publishes a pending submission with an explicit release payload", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Governance at a glance" });
    fireEvent.click(screen.getByRole("button", { name: /submissions/i }));
    fireEvent.click(screen.getByRole("button", { name: "Publish immutable release" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/org-1/releases"), expect.objectContaining({ method: "POST" })));
    const call = vi.mocked(fetch).mock.calls.find(([input, options]) => String(input).endsWith("/org-1/releases") && options?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ artifactId: "artifact-1", submissionId: "submission-1", name: "review", version: "1.2.0", channel: "stable", public: false });
  });

  it("loads publisher data without requesting administrator-only audit history", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/v1/auth/me")) return Response.json({ userId: "publisher", expiresAt: "2026-08-28T13:00:00.000Z" });
      if (path.endsWith("/v1/organizations")) return Response.json([{ id: "org-1", slug: "acme", name: "Acme" }]);
      if (path.endsWith("/org-1/members")) return Response.json([{ userId: "publisher", role: "publisher" }]);
      if (path.endsWith("/org-1/audit")) return Response.json({ message: "forbidden" }, { status: 403 });
      const key = Object.keys(fixture).find((name) => path.endsWith(`/org-1/${name}`));
      if (key) return Response.json(fixture[key as keyof typeof fixture]);
      return Response.json({ message: "not found" }, { status: 404 });
    });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Governance at a glance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submissions/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^audit$/i })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/org-1/audit"))).toBe(false);
  });

  it("approves a short-lived device session from the verification route", async () => {
    window.history.replaceState({}, "", "/device?userCode=A1B2C3D4E5");
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/v1/auth/me")) return Response.json({ userId: "octocat", expiresAt: "2026-08-28T13:00:00.000Z" });
      if (path.endsWith("/v1/organizations")) return Response.json([]);
      if (path.endsWith("/v1/auth/device/authorize") && init?.method === "POST") return Response.json({ approved: true });
      return Response.json({ message: "not found" }, { status: 404 });
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Authorize a device" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Authorize device" }));
    expect(await screen.findByRole("heading", { name: "Device authorized" })).toBeInTheDocument();
  });
});
