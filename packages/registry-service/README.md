# Harness Kit Registry Service

One versioned API powers the managed registry and the supported self-hosted edition. The service stores tenant records in PostgreSQL and immutable capsule blobs in S3-compatible storage.

## Local self-hosted stack

```bash
docker compose -f packages/registry-service/docker-compose.yml up --build
curl http://localhost:4810/health
```

Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the `registry` service to enable web-console OAuth. CLI and desktop clients use `POST /v1/auth/device` and poll `POST /v1/auth/device/token` for a short-lived access token.

Run the portable API contract against any deployment:

```bash
REGISTRY_CONTRACT_URL=http://localhost:4810 \
CONTRACT_BOOTSTRAP_SECRET=harness-contract-local \
pnpm --filter @harness-kit/registry-service test:contract
```

For a managed environment, provide a short-lived administrator token as `REGISTRY_CONTRACT_TOKEN` instead of enabling the test-only bootstrap endpoint. The same black-box contract runner is used for both deployments.

Artifacts are private until a publisher or administrator creates a release with `public: true`. The service distributes policy and rollout state but has no remote command-execution endpoint.
