#!/usr/bin/env bash
# Shared config for the Phase 1 attempt harness. Sourced by prep.sh / snapshot.sh / hidden.sh / reset.sh.
REPO=/home/user/perspectize
WT=$REPO/.claude/worktrees
P1=/tmp/claude-0/-home-user-perspectize/b4e8a1bc-45a6-543a-9d0b-379630c02c02/scratchpad/phase1

declare -A PARENT=(
  [T1]=dd05a9637d2b73ae36f6bb44a9da387dbfebe8dc
  [T2]=7c6f349ebbc686db13a67866c42204714cc3a015
  [T3]=c9dc64022eb76d7771edd9d5dfea4824e1a94855
  [T4]=d1c2fd6587596c01758d527697c3d5b9f31d5e4a
  [T5]=fff92579c56022f940841bfe14956ae54dad1c9f
  [T6]=f90309aefdcfac1e89852428f72bcea804b9ff98
  [T7]=af2aa79f460666b0e8168c4bee0bb8456f2b22bd
  [T8]=b582f9e3f74ed64aabe1c8a42ac5cd664dab2c8e
  [T9]=c7bc5e805046e4487825933ee90ec704ae9d5dc8
)
declare -A REAL=(
  [T1]=82330470 [T2]=984e6b7d [T3]=d1c2fd65 [T4]=8cc5035e
  [T5]=6d227da1 [T6]=af2aa79f [T7]=8d89d811 [T8]=f90309ae [T9]=92c03c5f
)
declare -A TRACK=(
  [T1]=backend [T2]=backend [T3]=backend [T4]=backend
  [T5]=frontend [T6]=frontend [T7]=frontend [T8]=frontend [T9]=frontend
)
# The real commit's changed test files (repo-relative). Overlaid after the agent finishes.
PG=backend/internal/adapters/repositories/postgres
SV=backend/internal/core/services
declare -A HIDDEN=(
  [T1]="$PG/gorm_content_sort_integration_test.go $PG/helpers_test.go"
  [T2]="$PG/gorm_content_repository_test.go $PG/gorm_content_sort_integration_test.go $PG/helpers_test.go"
  [T3]="$SV/latest_hub_test.go $SV/import_progress_test.go $SV/import_progress_semantics_test.go $SV/import_listing_progress_test.go $SV/import_listing_progress_semantics_test.go"
  [T4]="backend/test/services/import_limiter_test.go backend/test/services/import_service_test.go $PG/gorm_import_job_integration_test.go"
  [T5]="frontend/tests/unit/rowOrder.test.ts"
  [T6]="frontend/tests/components/PassageText.test.ts"
  [T7]="frontend/tests/components/TypePills.test.ts frontend/tests/unit/otherTypeOptions.test.ts"
  [T8]="frontend/tests/unit/plan-grid-config.test.ts"
  [T9]="frontend/tests/components/ActivityCardList.test.ts frontend/tests/components/ActivityDetailsModal.test.ts"
)
# Go packages (relative to backend/) that contain each backend task's hidden tests.
declare -A GOPKGS=(
  [T1]="./internal/adapters/repositories/postgres/..."
  [T2]="./internal/adapters/repositories/postgres/..."
  [T3]="./internal/core/services/..."
  [T4]="./internal/core/services/... ./test/services/... ./internal/adapters/repositories/postgres/..."
)
