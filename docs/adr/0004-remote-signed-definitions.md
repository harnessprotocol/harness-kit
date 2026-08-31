# Harness definitions are remotely-updatable signed data

Surface metadata (config paths, formats), the capability matrix, and recommendation rules are versioned, signed data fetched from harnesskit.ai, with a snapshot baked into every release as offline fallback. Chosen over compiling definitions into the binary because the harness landscape shifts monthly (config paths move, standards land, new harnesses appear) and accuracy must not wait on an app release. Signing matters: this data tells the tool where to write on users' machines, so it is an attack surface and must be verified.

Decided 2026-08-31 during the cross-harness config management design session.
