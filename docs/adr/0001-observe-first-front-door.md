# Observe-first front door; harness.yaml is the graduation step

HarnessKit's primary UX inventories whatever is natively configured across the surfaces on a machine and presents the comparison grid — no harness.yaml required to see value. Every copy/sync action routes through the portability engine's resource model underneath, so "adopt this machine as a profile" is a one-click graduation rather than a prerequisite. We chose this over profile-first (requiring harness.yaml adoption up front) because the format is the moat but the grid is the funnel: users arrive with drift pain, not a desire for a new config format.

Decided 2026-08-31 during the cross-harness config management design session.
