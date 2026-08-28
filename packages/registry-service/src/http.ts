import type { IncomingMessage, ServerResponse } from "node:http";
import type { GitHubOAuthProvider } from "./github-oauth.js";
import { RegistryError, RegistryService } from "./service.js";

export interface RegistryHttpOptions {
  github?: GitHubOAuthProvider;
  maxBodyBytes?: number;
  /** Test-only bootstrap, unavailable unless an explicit deployment secret is configured. */
  contractBootstrapSecret?: string;
  allowedOrigin?: string;
  allowedOrigins?: string[];
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function redirect(response: ServerResponse, location: string, cookie?: string): void {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...(cookie ? { "Set-Cookie": cookie } : {}),
  });
  response.end();
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new RegistryError(413, "request body is too large", "payload_too_large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RegistryError(400, "request body must be valid JSON", "invalid_json");
  }
}

function credential(request: IncomingMessage): { token?: string; viaCookie: boolean } {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return { token: authorization.slice("Bearer ".length), viaCookie: false };
  const cookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("hk_session="));
  return { token: cookie?.slice("hk_session=".length), viaCookie: Boolean(cookie) };
}

function safeOAuthReturnTo(value: string | null, publicBaseUrl: string, allowedOrigin?: string): string {
  const serviceOrigin = new URL(publicBaseUrl).origin;
  const consoleOrigin = allowedOrigin ? new URL(allowedOrigin).origin : serviceOrigin;
  if (!value) return `${consoleOrigin}/`;
  let destination: URL;
  try {
    destination = new URL(value, `${consoleOrigin}/`);
  } catch {
    throw new RegistryError(400, "OAuth return URL is invalid", "invalid_return_url");
  }
  if (
    ![serviceOrigin, consoleOrigin].includes(destination.origin) ||
    !["http:", "https:"].includes(destination.protocol) ||
    destination.username ||
    destination.password
  ) {
    throw new RegistryError(400, "OAuth return URL is not an allowed origin", "invalid_return_url");
  }
  return destination.toString();
}

function orgRoute(path: string): { organizationId: string; resource: string; resourceId?: string; action?: string } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "v1" || parts[1] !== "organizations" || !parts[2]) return null;
  return {
    organizationId: decodeURIComponent(parts[2]),
    resource: parts[3] ?? "",
    ...(parts[4] ? { resourceId: decodeURIComponent(parts[4]) } : {}),
    ...(parts[5] ? { action: parts[5] } : {}),
  };
}

export function createRegistryHttpHandler(service: RegistryService, options: RegistryHttpOptions = {}) {
  const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024;
  const allowedOrigins = [
    new URL(service.config.publicBaseUrl).origin,
    ...(options.allowedOrigin ? [options.allowedOrigin] : []),
    ...(options.allowedOrigins ?? []),
  ].map((origin) => origin.replace(/\/$/, ""));
  const authRequests = new Map<string, { count: number; resetAt: number }>();
  const enforceAuthRateLimit = (request: IncomingMessage, path: string): void => {
    const now = Date.now();
    const address = request.socket?.remoteAddress ?? "unknown";
    const key = `${address}:${path}`;
    const globalKey = `global:${path}`;
    const global = authRequests.get(globalKey);
    if (!global || global.resetAt <= now) authRequests.set(globalKey, { count: 1, resetAt: now + 60_000 });
    else {
      global.count += 1;
      if (global.count > 300) throw new RegistryError(429, "authorization service is busy", "rate_limited");
    }
    const current = authRequests.get(key);
    if (!current || current.resetAt <= now) {
      authRequests.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > 30) throw new RegistryError(429, "too many authorization requests", "rate_limited");
  };
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", service.config.publicBaseUrl);
      const path = url.pathname.replace(/\/$/, "") || "/";
      const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin.replace(/\/$/, "") : undefined;
      const responseOrigin = requestOrigin
        ? allowedOrigins.find((configuredOrigin) => configuredOrigin === requestOrigin)
        : undefined;
      if (requestOrigin && !responseOrigin) {
        throw new RegistryError(403, "request origin is not allowed", "origin_forbidden");
      }
      if (responseOrigin) {
        response.setHeader?.("Access-Control-Allow-Origin", responseOrigin);
        response.setHeader?.("Access-Control-Allow-Credentials", "true");
        response.setHeader?.("Vary", "Origin");
      }
      if (method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
        });
        response.end();
        return;
      }

      if (method === "GET" && path === "/health") {
        json(response, 200, { status: "ok", apiVersion: "v1" });
        return;
      }
      if (["POST", "PUT", "PATCH"].includes(method) && !String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        throw new RegistryError(415, "request body must use application/json", "unsupported_media_type");
      }
      if (method === "POST" && path === "/v1/testing/session" && options.contractBootstrapSecret) {
        if (request.headers["x-contract-secret"] !== options.contractBootstrapSecret) {
          throw new RegistryError(403, "invalid contract bootstrap secret", "forbidden");
        }
        const body = await readJson(request, maxBodyBytes);
        json(response, 201, { accessToken: await service.issueSessionForUser(String(body.userId ?? "contract-admin")) });
        return;
      }
      if (method === "POST" && path === "/v1/auth/device") {
        enforceAuthRateLimit(request, path);
        const body = await readJson(request, Math.min(maxBodyBytes, 16 * 1024));
        json(response, 201, await service.startDeviceAuthorization(String(body.clientName ?? "Harness Kit client")));
        return;
      }
      if (method === "POST" && path === "/v1/auth/device/token") {
        enforceAuthRateLimit(request, path);
        const body = await readJson(request, Math.min(maxBodyBytes, 16 * 1024));
        json(response, 200, await service.pollDeviceAuthorization(String(body.deviceCode ?? "")));
        return;
      }
      if (method === "GET" && path === "/v1/auth/github/start") {
        enforceAuthRateLimit(request, path);
        if (!options.github) throw new RegistryError(503, "GitHub OAuth is not configured", "oauth_unavailable");
        const state = await service.createOAuthState(safeOAuthReturnTo(
          url.searchParams.get("returnTo"),
          service.config.publicBaseUrl,
          options.allowedOrigin,
        ));
        redirect(response, options.github.authorizationUrl(state));
        return;
      }
      if (method === "GET" && path === "/v1/auth/github/callback") {
        if (!options.github) throw new RegistryError(503, "GitHub OAuth is not configured", "oauth_unavailable");
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || !code) throw new RegistryError(400, "OAuth callback is missing code or state", "invalid_oauth_callback");
        const continuation = await service.consumeOAuthState(state);
        const identity = await options.github.exchange(code);
        const token = await service.issueSessionForUser(identity.userId);
        redirect(
          response,
          continuation.returnTo,
          `hk_session=${token}; Path=/; HttpOnly; ${service.config.publicBaseUrl.startsWith("https:") ? "Secure; " : ""}SameSite=Lax; Max-Age=${service.config.sessionTtlSeconds ?? 900}`,
        );
        return;
      }
      if (method === "GET" && path.startsWith("/v1/public/organizations/")) {
        const parts = path.split("/").filter(Boolean);
        if (parts[4] === "artifacts" && parts[3] && parts[5] && parts[6] === "blob" && parts.length === 7) {
          const artifact = await service.getPublicArtifactByDigest(
            decodeURIComponent(parts[3]),
            decodeURIComponent(parts[5]),
          );
          if (!artifact) throw new RegistryError(404, "public artifact not found", "not_found");
          const blob = await service.readArtifactBlob(artifact.id);
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": blob.byteLength,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          });
          response.end(blob);
          return;
        }
        if (parts[4] !== "releases" || !parts[3] || !parts[5] || !parts[6]) {
          throw new RegistryError(404, "public release route not found", "not_found");
        }
        const release = await service.getPublicRelease(
          decodeURIComponent(parts[3]),
          decodeURIComponent(parts[5]),
          decodeURIComponent(parts[6]),
        );
        if (!release) throw new RegistryError(404, "public release not found", "not_found");
        if (parts[7] === "blob") {
          const blob = await service.readArtifactBlob(release.artifactId);
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": blob.byteLength,
            "Cache-Control": "public, max-age=0, must-revalidate",
            "Content-Location": `/v1/public/organizations/${encodeURIComponent(parts[3])}/artifacts/${encodeURIComponent(release.digest)}/blob`,
            "X-Content-Type-Options": "nosniff",
          });
          response.end(blob);
        } else if (parts.length === 7) {
          json(response, 200, release);
        } else {
          throw new RegistryError(404, "public release route not found", "not_found");
        }
        return;
      }

      const auth = credential(request);
      if (auth.viaCookie && ["POST", "PUT", "PATCH"].includes(method) && !responseOrigin) {
        throw new RegistryError(403, "cookie-authenticated mutations require an allowed origin", "csrf_forbidden");
      }
      const principal = await service.authenticate(auth.token);
      if (method === "GET" && path === "/v1/auth/me") {
        json(response, 200, principal);
        return;
      }
      if (method === "POST" && path === "/v1/auth/device/authorize") {
        const body = await readJson(request, maxBodyBytes);
        await service.authorizeDevice(String(body.userCode ?? ""), principal.userId);
        json(response, 200, { approved: true });
        return;
      }
      if (path === "/v1/organizations") {
        if (method === "GET") json(response, 200, await service.listOrganizations(principal.userId));
        else if (method === "POST") json(response, 201, await service.createOrganization(principal.userId, await readJson(request, maxBodyBytes) as any));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }

      const route = orgRoute(path);
      if (!route) throw new RegistryError(404, "route not found", "not_found");
      const { organizationId, resource, resourceId, action } = route;
      if (resource === "members" && !resourceId) {
        if (method === "GET") json(response, 200, await service.listMembers(organizationId, principal.userId));
        else if (method === "PUT") json(response, 200, await service.setMember(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "policy" && !resourceId) {
        if (method === "GET") json(response, 200, await service.getPolicy(organizationId, principal.userId));
        else if (method === "PUT") json(response, 200, await service.setPolicy(organizationId, principal.userId, await readJson(request, maxBodyBytes)));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "security-exceptions" && method === "POST") {
        json(response, 201, await service.createSecurityException(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        return;
      }
      if (resource === "artifacts") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listArtifacts(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.createArtifact(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else if (method === "GET" && resourceId && action === "blob") {
          const blob = await service.readArtifactBlob(resourceId, principal.userId);
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": blob.byteLength,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          });
          response.end(blob);
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "submissions") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listSubmissions(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.submitArtifact(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "releases") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listReleases(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.publishRelease(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else if (method === "PATCH" && resourceId && action === "label") {
          const body = await readJson(request, maxBodyBytes);
          json(response, 200, await service.repointRelease(organizationId, principal.userId, resourceId, String(body.artifactId ?? "")));
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "rollouts") {
        if (method === "GET" && !resourceId) json(response, 200, await service.listRollouts(organizationId, principal.userId));
        else if (method === "POST" && !resourceId) json(response, 201, await service.createRollout(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else if (method === "PATCH" && resourceId && !action) {
          const body = await readJson(request, maxBodyBytes);
          json(response, 200, await service.updateRollout(organizationId, principal.userId, resourceId, body.status));
        } else if (method === "POST" && resourceId && action === "report") {
          json(response, 200, await service.reportRolloutHealth(organizationId, principal.userId, resourceId, await readJson(request, maxBodyBytes) as any));
        } else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "inventory") {
        if (method === "GET") json(response, 200, await service.listInventory(organizationId, principal.userId));
        else if (method === "POST") json(response, 201, await service.uploadInventory(organizationId, principal.userId, await readJson(request, maxBodyBytes) as any));
        else throw new RegistryError(405, "method not allowed", "method_not_allowed");
        return;
      }
      if (resource === "audit" && method === "GET") {
        json(response, 200, await service.listAudit(organizationId, principal.userId));
        return;
      }
      throw new RegistryError(404, "route not found", "not_found");
    } catch (error) {
      if (error instanceof RegistryError) {
        json(response, error.status, { error: error.code, message: error.message });
      } else {
        json(response, 500, { error: "internal_error", message: "Internal server error" });
      }
    }
  };
}
