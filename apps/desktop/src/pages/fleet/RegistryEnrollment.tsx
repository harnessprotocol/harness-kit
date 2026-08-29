import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Button, StatusChip } from "@harness-kit/ui";
import type { InventorySnapshot } from "@harness-kit/core";

const REGISTRY_URL_KEY = "harness-kit-registry-url";
const REGISTRY_TOKEN_KEY = "harness-kit-registry-session";
const ORGANIZATION_KEY = "harness-kit-registry-organization";

interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

interface Organization { id: string; name: string }
interface Rollout {
  status: "scheduled" | "active" | "paused" | "completed" | "rolled-back";
  effectiveAt: string;
  releaseDigest: string;
}

type EnrollmentStatus = "not-enrolled" | "authorizing" | "current" | "pending" | "paused" | "rolled-back" | "error";

async function request<T>(base: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(value.message ?? `Registry request failed (${response.status})`);
  return value as T;
}

export function RegistryEnrollment({ inventory }: { inventory: Omit<InventorySnapshot, "organizationId"> }) {
  const [registryUrl, setRegistryUrl] = useState(() => localStorage.getItem(REGISTRY_URL_KEY) ?? "http://localhost:4810");
  const [token, setToken] = useState(() => sessionStorage.getItem(REGISTRY_TOKEN_KEY));
  const [status, setStatus] = useState<EnrollmentStatus>(token ? "pending" : "not-enrolled");
  const [detail, setDetail] = useState(token
    ? "Loading organization assignment…"
    : "Connect this device to receive governed rollout assignments.");
  const [userCode, setUserCode] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState(() => localStorage.getItem(ORGANIZATION_KEY) ?? "");

  async function sync(activeToken: string, preferredOrganization = organizationId): Promise<void> {
    try {
      const available = await request<Organization[]>(registryUrl, "/v1/organizations", activeToken);
      setOrganizations(available);
      const selected = available.find((organization) => organization.id === preferredOrganization) ?? available[0];
      if (!selected) {
        setStatus("current");
        setDetail("Authorized, but this identity has no organization membership.");
        return;
      }
      setOrganizationId(selected.id);
      localStorage.setItem(ORGANIZATION_KEY, selected.id);
      const rollouts = await request<Rollout[]>(
        registryUrl,
        `/v1/organizations/${selected.id}/rollouts`,
        activeToken,
      );
      await request(registryUrl, `/v1/organizations/${selected.id}/inventory`, activeToken, {
        ...inventory,
        organizationId: selected.id,
        capturedAt: new Date().toISOString(),
      });
      const latest = rollouts.slice().sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0];
      if (!latest) {
        setStatus("current");
        setDetail(`${selected.name}: inventory uploaded; no rollout is assigned.`);
        return;
      }
      const mapped: EnrollmentStatus = latest.status === "paused"
        ? "paused"
        : latest.status === "rolled-back"
          ? "rolled-back"
          : latest.status === "completed" ? "current" : "pending";
      setStatus(mapped);
      setDetail(`${selected.name}: ${latest.status} · ${latest.releaseDigest.slice(0, 22)}…`);
    } catch (error) {
      if (error instanceof Error && /session|auth/i.test(error.message)) {
        sessionStorage.removeItem(REGISTRY_TOKEN_KEY);
        setToken(null);
        setStatus("not-enrolled");
      } else {
        setStatus("error");
      }
      setDetail(error instanceof Error ? error.message : "Registry sync failed");
    }
  }

  useEffect(() => {
    if (token) void sync(token);
  }, [token]);

  async function enroll(): Promise<void> {
    localStorage.setItem(REGISTRY_URL_KEY, registryUrl);
    setStatus("authorizing");
    setDetail("Waiting for authorization in the web console…");
    try {
      const authorization = await request<DeviceAuthorization>(registryUrl, "/v1/auth/device", undefined, {
        clientName: "Harness Kit Desktop",
      });
      setUserCode(authorization.userCode);
      const verification = new URL(authorization.verificationUri);
      if (!["http:", "https:"].includes(verification.protocol)) {
        throw new Error("Registry returned an unsafe verification URL");
      }
      verification.searchParams.set("userCode", authorization.userCode);
      await open(verification.toString());
      while (Date.now() < new Date(authorization.expiresAt).getTime()) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(authorization.interval, 1) * 1000));
        const result = await request<{ status: string; accessToken?: string }>(
          registryUrl,
          "/v1/auth/device/token",
          undefined,
          { deviceCode: authorization.deviceCode },
        );
        if (result.status !== "approved" || !result.accessToken) continue;
        sessionStorage.setItem(REGISTRY_TOKEN_KEY, result.accessToken);
        setToken(result.accessToken);
        setUserCode(null);
        return;
      }
      throw new Error("Device authorization expired before approval.");
    } catch (error) {
      setStatus("error");
      setDetail(error instanceof Error ? error.message : "Device enrollment failed");
    }
  }

  const tone = status === "error" || status === "rolled-back"
    ? "danger"
    : status === "authorizing" || status === "pending" || status === "paused" ? "warning" : "subtle";

  return (
    <div className="hk-registry-enrollment">
      <div className="hk-registry-status">
        <StatusChip variant={tone}>{status}</StatusChip>
        <p>{detail}</p>
      </div>
      {organizations.length > 1 && (
        <label>
          Organization
          <select
            value={organizationId}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              if (token) void sync(token, event.target.value);
            }}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>
      )}
      {!token && (
        <>
          <label>
            Registry URL
            <input value={registryUrl} onChange={(event) => setRegistryUrl(event.target.value)} inputMode="url" />
          </label>
          {userCode && <code className="hk-device-code">{userCode}</code>}
          <Button variant="primary" size="sm" onClick={() => void enroll()} disabled={status === "authorizing"}>
            {status === "authorizing" ? "Waiting for approval…" : "Enroll this device"}
          </Button>
        </>
      )}
      {token && <Button variant="ghost" size="sm" onClick={() => void sync(token)}>Refresh assignment</Button>}
    </div>
  );
}
