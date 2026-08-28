import type { AdminData, Organization, Principal } from "./types";

export const API_BASE = (import.meta.env.VITE_REGISTRY_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new ApiError(response.status, body.message ?? `Request failed (${response.status})`);
  return body as T;
}

export async function organizations(): Promise<Organization[]> {
  return api("/v1/organizations");
}

export async function currentPrincipal(): Promise<Principal> {
  return api("/v1/auth/me");
}

export function githubLoginUrl(returnTo = window.location.href): string {
  return `${API_BASE}/v1/auth/github/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function loadAdminData(organizationId: string, userId: string): Promise<AdminData> {
  const root = `/v1/organizations/${organizationId}`;
  const members = await api<AdminData["members"]>(`${root}/members`);
  const role = members.find((member) => member.userId === userId)?.role ?? "member";
  const canPublish = role === "publisher" || role === "administrator";
  const [artifacts, submissions, releases, policy, rollouts, inventory, audit] = await Promise.all([
    api(`${root}/artifacts`),
    canPublish ? api(`${root}/submissions`) : Promise.resolve([]),
    api(`${root}/releases`),
    api(`${root}/policy`),
    api(`${root}/rollouts`),
    canPublish ? api(`${root}/inventory`) : Promise.resolve([]),
    role === "administrator" ? api(`${root}/audit`) : Promise.resolve([]),
  ]);
  return { members, artifacts, submissions, releases, policy, rollouts, inventory, audit } as AdminData;
}
