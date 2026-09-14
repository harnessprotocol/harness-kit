# Harness definitions are remotely-updatable signed data

Surface metadata (config paths, formats), the capability matrix, and recommendation rules are versioned, signed data fetched from harnesskit.ai, with a snapshot baked into every release as offline fallback. Chosen over compiling definitions into the binary because the harness landscape shifts monthly (config paths move, standards land, new harnesses appear) and accuracy must not wait on an app release. Signing matters: this data tells the tool where to write on users' machines, so it is an attack surface and must be verified.

Decided 2026-08-31 during the cross-harness config management design session.

## Amendment, 2026-09-08 — trust anchor, key custody, cadence

Three things this ADR left unspecified, decided while implementing M4.

**The trust anchor is the compiled-in key list, permanently.** Runtime key rotation (design.md D7's cross-signed transition statement) was built and withdrawn: a replayed statement resurrected a key that had been revoked, and revoking the outgoing key destroyed the incoming one, so rotation could not survive the event it exists for. Both trace to expiry and compromise sharing one `notAfter` field. Introducing a key now requires a release, which is acceptable because the CLI ships via Homebrew and the app via a cask and both already auto-update. Definitions still update without a release; only keys do not.

**The private key is held offline, never in CI.** Bundles are signed on the maintainer's machine and CI publishes a pre-signed artifact, so a compromised workflow cannot sign definitions. The alternative — a CI secret — puts a key that rewrites the user-scope write allowlist and every installer's argv within reach of any workflow that can read secrets. Definitions change rarely enough that the manual step is cheap.

**Verification is fetched at most once every 24 hours,** cached with the bytes and signature that verified. The cache is re-verified on load rather than trusted, since it sits in a file any process running as the user can rewrite. Fetching per command was measured at two requests and up to a 10s timeout on every invocation.

Still open: no freshness bound. An attacker who can withhold updates pins a client on the newest bundle it has seen. Anti-rollback stops movement backwards; nothing notices standing still.
