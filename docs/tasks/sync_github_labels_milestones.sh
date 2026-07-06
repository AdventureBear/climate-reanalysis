#!/usr/bin/env bash
set -euo pipefail

repo="AdventureBear/climate-reanalysis"

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

require_gh_auth

ensure_label "type:bug" "d73a4a" "Broken or misleading behavior"
ensure_label "type:feature" "0e8a16" "User-facing capability"
ensure_label "type:docs" "0075ca" "Documentation work"
ensure_label "type:tech-debt" "c5def5" "Refactor or maintenance work"
ensure_label "type:science" "5319e7" "Meteorological, climatology, or scientific correctness review"

ensure_label "area:frontend" "1d76db" "Frontend UI, React state, or recipe-building surface"
ensure_label "area:backend" "0052cc" "Backend API, retrieval, compute, or service logic"
ensure_label "area:rendering" "fbca04" "Matplotlib, Cartopy, map layout, or image output"
ensure_label "area:climatology" "bfdadc" "Climatology sources, anomalies, normalization"
ensure_label "area:deployment" "5319e7" "Render, environment, operations, storage, observability"
ensure_label "area:color-scales" "f9d0c4" "Color scales, palettes, boundaries, Color Lab"

ensure_label "priority:P0" "b60205" "App unusable or scientifically misleading"
ensure_label "priority:P1" "d93f0b" "Important user-facing or science issue"
ensure_label "priority:P2" "fbca04" "Needed soon; workaround exists"
ensure_label "priority:P3" "cfd3d7" "Polish, cleanup, or future work"

ensure_label "status:blocked" "000000" "Blocked by user input, external dependency, or decision"
ensure_label "status:needs-domain-review" "ededed" "Needs meteorology/domain expert review"
ensure_label "good-first-issue" "7057ff" "Good candidate for a new contributor"

ensure_milestone "M1 Stabilize Deployed App" "Render deployment, smoke recipes, source disclaimers, and critical stabilization."
ensure_milestone "M2 Scientific Rendering Audit" "Color scales, climatology decisions, and scientific correctness review."
ensure_milestone "M3 Frontend Refactor Foundation" "Extract focused components/hooks from the current App.tsx surface."
ensure_milestone "M4 Surface + Expanded Variables" "Surface/named-level climatology/anomaly support and expanded variables."
ensure_milestone "M5 Production Readiness" "Caching, persistent storage, rate guards, and observability."

echo "GitHub labels and milestones are synced."

