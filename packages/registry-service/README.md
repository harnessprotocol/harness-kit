# Harness Kit Registry Service

One versioned API powers the managed registry and the supported self-hosted edition. The service stores tenant records in PostgreSQL and immutable capsule blobs in S3-compatible storage. Organization workflows remain a release preview until the same black-box contract below passes against both deployment modes.

## Local self-hosted stack

```bash
docker compose -f packages/registry-service/docker-compose.yml up -d --build
curl http://localhost:4810/health
export HARNESS_API_URL=http://localhost:4810
```

The stack exposes the API on `http://localhost:4810` and the administration console on `http://localhost:4174`. Set `WEB_ORIGIN` to the console's external origin when deploying them separately.

Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the `registry` service to enable web-console OAuth. CLI and desktop clients use `POST /v1/auth/device`, direct the user to the console's `/device` approval page, and poll `POST /v1/auth/device/token` for a short-lived access token. The desktop keeps that token only for its current app session and uploads an on-device-redacted inventory after enrollment.

An enrolled CLI client polls its assigned rollout with `harness-kit org rollout-sync <organization-id>`. Each rollout pins both the artifact ID and digest at creation, so later version-label mutation cannot change the bytes seen by already-assigned clients. Optional updates preview by default; `automaticUpdates` policy authorizes transactional apply, a post-install reconciliation health check, and local last-known-good restoration without a second prompt.

Run the portable black-box API contract against any deployment:

```bash
REGISTRY_CONTRACT_URL=http://localhost:4810 \
CONTRACT_BOOTSTRAP_SECRET=harness-contract-local \
pnpm --filter @harness-kit/registry-service test:contract
```

For a managed environment, provide a short-lived administrator token as `REGISTRY_CONTRACT_TOKEN` instead of enabling the test-only bootstrap endpoint. The same black-box contract runner is used for both deployments.

Artifacts are private until a publisher or administrator creates a release with `public: true`. The service distributes policy and rollout state but has no remote command-execution endpoint.
