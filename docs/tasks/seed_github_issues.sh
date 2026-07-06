#!/usr/bin/env bash
set -euo pipefail

repo="AdventureBear/climate-reanalysis"

cat <<'WARNING'
WARNING: This script creates the initial seed issues.

It is intentionally one-time only. Running it again can create duplicate issues.
For routine label/milestone updates, run:

  bash docs/tasks/sync_github_labels_milestones.sh

WARNING

read -r -p "Type SEED to create seed issues: " confirmation
if [[ "$confirmation" != "SEED" ]]; then
  echo "Aborted."
  exit 1
fi

require_gh_auth() {
  if ! gh auth status -h github.com >/dev/null 2>&1; then
    echo "GitHub CLI is not authenticated. Run: gh auth login -h github.com" >&2
    exit 1
  fi
}

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  if gh label view "$name" --repo "$repo" >/dev/null 2>&1; then
    gh label edit "$name" --repo "$repo" --color "$color" --description "$description"
  else
    gh label create "$name" --repo "$repo" --color "$color" --description "$description"
  fi
}

ensure_milestone() {
  local title="$1"
  local description="$2"
  if gh api "repos/$repo/milestones" --jq '.[].title' | grep -Fxq "$title"; then
    echo "Milestone exists: $title"
  else
    gh api "repos/$repo/milestones" -f title="$title" -f description="$description" >/dev/null
    echo "Created milestone: $title"
  fi
}

create_issue() {
  local title="$1"
  local milestone="$2"
  local labels="$3"
  local body="$4"
  gh issue create \
    --repo "$repo" \
    --title "$title" \
    --milestone "$milestone" \
    --label "$labels" \
    --body "$body"
}

require_gh_auth

bash "$(dirname "$0")/sync_github_labels_milestones.sh"

echo "Creating initial seed issues."

create_issue "Document Render deployment settings and environment variables" \
  "M1 Stabilize Deployed App" \
  "area:deployment,type:docs,priority:P1" \
  $'## Goal\nDocument the current Render.com backend/frontend deployment settings so deployment knowledge is not implicit.\n\n## Acceptance Criteria\n- Backend service build/start commands are documented.\n- Frontend service build/start commands are documented.\n- Required env vars are listed, including CORS_ORIGINS and VITE_API_URL.\n- Any current Render health check or deploy notes are captured.\n\n## Verification\n- A contributor can compare README/PROJECT notes to Render settings without guessing.'

create_issue "Add smoke-test recipes for 3-hourly, daily, monthly, and anomaly modes" \
  "M1 Stabilize Deployed App" \
  "type:tech-debt,area:backend,area:frontend,priority:P1" \
  $'## Goal\nCreate a small repeatable smoke checklist for the deployed app and local development.\n\n## Acceptance Criteria\n- At least one known recipe for 3-hourly raw maps.\n- At least one known recipe for daily composite maps.\n- At least one known recipe for monthly composite maps.\n- At least one known recipe for anomaly or normalized anomaly maps.\n- Expected success criteria are documented.\n\n## Verification\n- Recipes can be run locally and on Render.'

create_issue "Add user-facing climatology/source disclaimer" \
  "M1 Stabilize Deployed App" \
  "type:feature,area:frontend,area:climatology,priority:P1" \
  $'## Goal\nMake climatology source choices visible enough that users understand when anomalies use R2 daily/monthly baselines rather than CORe-native climatology.\n\n## Acceptance Criteria\n- UI or FAQ explains current climatology sources.\n- Sub-monthly anomaly source policy is clear.\n- Monthly anomaly source options are clear.\n- CORe-native daily climatology is identified as future work.\n\n## Verification\n- User can determine the baseline source from the app without reading code.'

create_issue "Audit upper-air temperature color scales" \
  "M2 Scientific Rendering Audit" \
  "type:science,area:color-scales,area:rendering,priority:P1,status:needs-domain-review" \
  $'## Goal\nReview and define fixed temperature color scales above 700 mb.\n\n## Acceptance Criteria\n- Target levels are listed.\n- Reference source or domain review is documented.\n- Proposed boundaries and palettes are captured.\n- Implementation issue is created or linked if code changes are needed.\n\n## Verification\n- Domain reviewer approves or requests changes.'

create_issue "Validate wind-speed mid/high color scales" \
  "M2 Scientific Rendering Audit" \
  "type:science,area:color-scales,area:rendering,priority:P1,status:needs-domain-review" \
  $'## Goal\nValidate wind-speed ranges and breakpoints for mid/high-level wind maps.\n\n## Acceptance Criteria\n- 500/400 mb range decision is documented.\n- 300 mb and above range decision is documented.\n- 600 mb and 400 mb grouping questions are resolved.\n- Pivotal Weather or other reference evidence is captured.\n\n## Verification\n- Domain reviewer approves or requests changes.'

create_issue "Decide climatology source policy with domain expert" \
  "M2 Scientific Rendering Audit" \
  "type:science,area:climatology,priority:P0,status:needs-domain-review" \
  $'## Goal\nConfirm the scientifically acceptable climatology source policy for raw anomalies and normalized anomalies.\n\n## Acceptance Criteria\n- R2 daily cross-dataset policy is approved, revised, or rejected.\n- Monthly-pgb/R2 monthly policy is approved, revised, or rejected.\n- CORe-native daily climatology plan is clarified.\n- PROJECT.md is updated with the decision.\n\n## Verification\n- Decision is recorded with reviewer/context.'

create_issue "Extract time controls from App.tsx" \
  "M3 Frontend Refactor Foundation" \
  "type:tech-debt,area:frontend,priority:P2" \
  $'## Goal\nExtract time mode/submode/date/month/hour controls from the large App.tsx component without changing behavior.\n\n## Acceptance Criteria\n- Time controls live in a focused component or hook.\n- Existing mapRecipe flow is preserved.\n- No behavior changes outside the extraction.\n\n## Verification\n- npm run build\n- npm run lint\n- Manual recipe generation for 3-hourly, daily, monthly.'

create_issue "Extract variable/level controls from App.tsx" \
  "M3 Frontend Refactor Foundation" \
  "type:tech-debt,area:frontend,priority:P2" \
  $'## Goal\nExtract variable and level controls while preserving variableConfig.ts as the mapping source of truth.\n\n## Acceptance Criteria\n- Variable/level UI is isolated in focused component/hook.\n- variableConfig.ts remains the mapping source of truth.\n- No duplicated API mapping logic is introduced.\n\n## Verification\n- npm run build\n- npm run lint\n- Manual checks for pressure-level and surface/named-level variables.'

create_issue "Extract Color Lab from App.tsx" \
  "M3 Frontend Refactor Foundation" \
  "type:tech-debt,area:frontend,area:color-scales,priority:P2" \
  $'## Goal\nMove Color Lab UI and scale-designer state out of App.tsx into focused components/hooks.\n\n## Acceptance Criteria\n- Color Lab rendering is extracted.\n- Scale metadata request behavior is preserved.\n- scale_spec export/application behavior is preserved.\n\n## Verification\n- npm run build\n- npm run lint\n- Manual Color Lab open/edit/export/generate check.'

create_issue "Configure PYRE_CACHE_DIR" \
  "M5 Production Readiness" \
  "type:tech-debt,area:backend,area:deployment,priority:P1" \
  $'## Goal\nReplace hardcoded monthly observation cache location with production-shaped configuration.\n\n## Acceptance Criteria\n- Backend reads PYRE_CACHE_DIR or equivalent.\n- Local default remains usable.\n- Render deployment can point cache to intended storage path.\n- PROJECT/README deployment notes are updated if needed.\n\n## Verification\n- uv run pytest\n- Manual map request verifies cache path is used.'

create_issue "Add cache cleanup/bounds policy" \
  "M5 Production Readiness" \
  "type:tech-debt,area:backend,area:deployment,priority:P2" \
  $'## Goal\nPrevent unbounded cache growth as usage increases.\n\n## Acceptance Criteria\n- Cache types and expected sizes are documented.\n- Cleanup or bounds strategy is selected.\n- Implementation issue is created or linked if separate.\n\n## Verification\n- Cache behavior can be reasoned about for Render deployment.'

create_issue "Add request/rate guards for public deployment" \
  "M5 Production Readiness" \
  "type:feature,area:backend,area:deployment,priority:P1" \
  $'## Goal\nProtect the deployed app and upstream data sources from expensive or abusive requests.\n\n## Acceptance Criteria\n- Request limits are defined for dates/months/hours/regions where needed.\n- User-facing error messages are clear.\n- Expensive composites have guardrails.\n\n## Verification\n- uv run pytest\n- Manual requests for allowed and rejected recipes.'

echo "GitHub issue setup complete."
