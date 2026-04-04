# CI Build Workflow Verification Checklist

**Subtask:** subtask-5-2  
**Status:** Pending PR merge  
**Created:** 2026-04-04

## Pre-Merge Verification ✅

- [x] Build workflow file exists at `.github/workflows/build.yml`
- [x] Workflow is properly configured:
  - [x] Triggers on `push` and `pull_request` to `main` branch
  - [x] Uses `pnpm/action-setup@v4` for pnpm installation
  - [x] Uses `actions/setup-node@v4` with `cache: pnpm` for dependency caching
  - [x] Runs `pnpm install --frozen-lockfile`
  - [x] Runs `pnpm -r build` to build all packages recursively
  - [x] Includes concurrency group with `cancel-in-progress: true`
  - [x] Sets reasonable timeout (30 minutes)
- [x] Build badge added to README.md
- [x] Badge uses correct format: `![Build](https://img.shields.io/github/actions/workflow/status/...)`
- [x] Badge is positioned near other status badges (Validate, Release)

## Post-Merge Verification (PENDING)

After the PR is merged to main, verify:

### 1. PR Merge
- [ ] PR created for branch `auto-claude/007-monorepo-build-health-ci-hardening`
- [ ] All CI checks pass on the PR
- [ ] PR merged to `main` branch

### 2. CI Workflow Execution on Main
- [ ] Navigate to: https://github.com/harnessprotocol/harness-kit/actions/workflows/build.yml
- [ ] Verify workflow run triggered on `main` branch
- [ ] Verify workflow status is "completed"
- [ ] Verify workflow conclusion is "success"
- [ ] Check that all packages built successfully:
  - [ ] packages/shared
  - [ ] packages/core
  - [ ] packages/board-server
  - [ ] packages/chat-relay
  - [ ] apps/board
  - [ ] apps/cli
  - [ ] apps/desktop
  - [ ] apps/marketplace
  - [ ] website

### 3. Build Badge Verification
- [ ] Navigate to: https://github.com/harnessprotocol/harness-kit
- [ ] Verify build badge shows "passing" (green)
- [ ] Click badge to confirm it links to workflow page
- [ ] Verify badge updates correctly (may take a few minutes after merge)

### 4. Integration Test
- [ ] Fresh clone of `main` branch builds successfully
- [ ] `pnpm install && pnpm build` completes without errors
- [ ] Build time is reasonable (<5 minutes with cache)

## Expected Timeline

1. **Now:** Create PR with all changes
2. **After PR creation:** Build workflow runs on PR
3. **After PR merge:** Build workflow runs on `main` branch
4. **Within minutes:** Build badge updates to show status

## Troubleshooting

If the build fails on main:

1. Check workflow logs: https://github.com/harnessprotocol/harness-kit/actions/workflows/build.yml
2. Common issues:
   - Missing dependencies in `package.json`
   - TypeScript compilation errors
   - Broken imports/exports
   - Tauri build failures
3. If needed, create a hotfix PR to address the issue

## Completion Criteria

This subtask is complete when:
- ✅ PR is merged to `main`
- ✅ Build workflow passes on `main` branch
- ✅ Build badge shows "passing" on README
- ✅ Fresh clone of `main` builds successfully

---

**Note:** This verification must be performed manually after the PR merge. The automated CI workflow will provide the actual pass/fail status.
