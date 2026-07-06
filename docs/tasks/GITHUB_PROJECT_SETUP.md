# GitHub Project Setup

This repo uses GitHub Issues as the execution tracker.

`PROJECT.md` remains the canonical project reference. GitHub Issues track actionable work. Pull requests track implementation history.

## One-Time Setup

Authenticate the GitHub CLI:

```bash
gh auth login -h github.com
```

Then run the safe, rerunnable label/milestone sync:

```bash
bash docs/tasks/sync_github_labels_milestones.sh
```

This script creates or updates labels and milestones. It is safe to rerun.

## One-Time Seed Issues

The initial seed issues listed in `docs/tasks/INITIAL_ISSUES.md` have already been created once.

Do not rerun the seed script unless you intentionally want duplicate issues:

```bash
bash docs/tasks/seed_github_issues.sh
```

The seed script requires typing `SEED` before it creates issues.

## Labels

Types:

- `type:bug`
- `type:feature`
- `type:docs`
- `type:tech-debt`
- `type:science`

Areas:

- `area:frontend`
- `area:backend`
- `area:rendering`
- `area:climatology`
- `area:deployment`
- `area:color-scales`

Priorities:

- `priority:P0`
- `priority:P1`
- `priority:P2`
- `priority:P3`

Statuses:

- `status:blocked`
- `status:needs-domain-review`

Other:

- `good-first-issue`

## Milestones

- M1 Stabilize Deployed App
- M2 Scientific Rendering Audit
- M3 Frontend Refactor Foundation
- M4 Surface + Expanded Variables
- M5 Production Readiness

## Working Agreement

- Keep only 1-3 active issues in progress at a time.
- Treat scientifically misleading output as a production bug.
- Every issue should include acceptance criteria and verification.
- Update `PROJECT.md` only when status, roadmap, known issues, or scientific/product decisions change.
- Update `README.md` only when setup, deployment, or onboarding changes.
- Update `AGENTS.md` or `CLAUDE.md` only when agent operating rules change.
