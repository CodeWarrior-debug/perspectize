# Repository & Auth Adapter Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise `internal/adapters/repositories/postgres` from 0% to ≥70% and `internal/adapters/auth` from 5.7% to ≥80% statement coverage with real behavioural tests (no padding, no assertion-free "smoke" tests).

**Architecture:** Both packages are hexagonal *adapters*. The postgres package splits cleanly into ~250 statements of **pure logic** (PostgreSQL array `Scan`/`Value` codecs, domain↔GORM mappers, enum converters, cursor sort-rule builders) that need zero infrastructure, and ~270 statements of **GORM repository methods** whose real logic is error translation (`gorm.ErrRecordNotFound` → `domain.ErrNotFound`), `RowsAffected == 0` handling, error wrapping, and dynamic filter chaining. The pure logic gets straight table-driven unit tests; the repository methods get `sqlmock`-backed tests through a real `*gorm.DB` wired to a mock `*sql.DB` (`gorm.io/driver/postgres` supports `postgres.New(postgres.Config{Conn: sqlDB})`, which performs **no** connection round-trip at init). The auth package gets a one-function behaviour-preserving refactor (extracting the inner `http.HandlerFunc` out of `Middleware` into `newAuthHandler`) so its user-resolution branches can be driven directly with `clerk.ContextWithSessionClaims`, plus full webhook-handler tests using svix's own `Sign` to produce genuinely valid signatures.

**Tech Stack:** Go 1.25 · `testify` (already a dependency) · `gorm.io/gorm` + `gorm.io/driver/postgres` (already dependencies) · `github.com/pilagod/gorm-cursor-paginator/v2` (already a dependency) · `github.com/clerk/clerk-sdk-go/v2` incl. its `clerktest` sub-package (already a dependency) · `github.com/svix/svix-webhooks/go` (already a dependency) · **`github.com/DATA-DOG/go-sqlmock` (NEW, test-only)**.

### Why one new dependency is justified

`go-sqlmock` is the only addition. It is required because:
- The repository methods' real logic (ErrNotFound translation, `RowsAffected == 0` → `domain.ErrNotFound`, `fmt.Errorf(...%w)` wrapping, the ~20-branch filter chain in `GormContentRepository.List`) is **only reachable through a `*gorm.DB`**. Nothing in these methods is extractable into a pure function without a large, unjustified refactor of production code.
- The repo's existing DB-dependent tests (`test/database/postgres_test.go`) `t.Skip()` when Postgres is unreachable, per `backend/CLAUDE.md` ("Integration: Auto-skip when DB unavailable"). Skipped tests contribute **zero** coverage, so an integration-only approach cannot meet a coverage target deterministically.
- `testcontainers` would add a heavyweight dependency plus a Docker requirement to every `go test ./...` run — worse for CI cost and for the repo's stated "unit tests mock deps, no DB" convention.
- `sqlmock` is test-only (`go.mod` require block, not imported by any production file), ~zero transitive deps.

---

## Global Constraints

- All new postgres tests use `package postgres` (in-package, same directory) — the functions under test (`contentTypeToDBValue`, `perspectiveModelToDomain`, `buildContentSortRules`, …) are **unexported** and cannot be reached from `backend/test/`. This follows the existing in-package precedent: `internal/adapters/youtube/sanitize_test.go`, `internal/adapters/web/middleware/secureheaders_test.go`, `pkg/database/stats_test.go`.
- All new auth tests use `package auth` (in-package) for the same reason (`newAuthHandler`, `clerkUserData`, `withUser`).
- Assertions use `github.com/stretchr/testify/assert` and `.../require` — the repo's established library. Use `require` for anything a later assertion depends on (nil checks, unmarshal errors); `assert` otherwise.
- Every test must assert on concrete values. `assert.NotNil` alone is not an acceptable test.
- **No chained bash commands** (repo rule in root `CLAUDE.md`): run each command as its own invocation; never join with `&&`.
- Do not modify any file under `backend/test/` — those packages are black-box and unrelated to this work.
- Only one production file changes in this entire plan: `internal/adapters/auth/clerk_middleware.go` (Task 8), a behaviour-preserving extraction. No other production code may be edited.
- Run tests from `backend/`. Prefer the terse form from the `running-tests` skill for full-suite runs; per-task runs use the explicit `go test` commands given below.
- Gofmt everything (`gofmt -l .` must print nothing before each commit).

## Coverage Targets (justified)

| Package | Now | Target | Basis |
|---|---|---|---|
| `internal/adapters/repositories/postgres` | 0% (0/523) | **≥ 70%** | ~250 stmts are pure functions → target ~95%. ~270 stmts are GORM methods; sqlmock covers error mapping, `RowsAffected`, and the `List` filter chain but not GORM/paginator internals or every driver-error permutation → target ~55–60%. Combined ≈ 392/523 ≈ 75%; floor set at 70%. |
| `internal/adapters/auth` | 5.7% (8/141) | **≥ 80%** | `context.go` (~10 stmts) and `webhook_handler.go` (~75 stmts) are ~100% reachable. `clerk_middleware.go` (~56 stmts) is ~90% reachable after the Task 8 extraction; the residual is the `clerkhttp.WithHeaderAuthorization()` wiring in `Middleware`, which requires a real signed Clerk JWT + JWKS server to reach and is not worth the brittleness. ≈ 125/141 ≈ 88%; floor set at 80%. |

Not a gate: the project `TOTAL` line (currently 22.76%) is expected to rise roughly 8–12 points. Record it; do not block on it.

---

### Task 1: PostgreSQL array codec tests (`array_types.go`)

**Subagent type:** `go-backend`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/array_types_test.go`

**Interfaces:**
- Consumes: nothing from other tasks — fully independent, run in parallel with Tasks 2, 3, 4, 8, 9.
- Produces: nothing other tasks rely on.

Functions under test, all in `backend/internal/adapters/repositories/postgres/array_types.go`:
- `func (a *StringArray) Scan(src interface{}) error`
- `func (a StringArray) Value() (driver.Value, error)`
- `func (a *Int64Array) Scan(src interface{}) error`
- `func (a Int64Array) Value() (driver.Value, error)`

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/array_types_test.go`:

  ```go
  package postgres

  import (
  	"testing"

  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  func TestStringArray_Scan(t *testing.T) {
  	tests := []struct {
  		name    string
  		src     interface{}
  		want    StringArray
  		wantNil bool
  		errMsg  string
  	}{
  		{name: "nil source yields nil slice", src: nil, wantNil: true},
  		{name: "empty array literal", src: "{}", want: StringArray{}},
  		{name: "simple elements", src: "{a,b,c}", want: StringArray{"a", "b", "c"}},
  		{name: "byte slice source", src: []byte("{x,y}"), want: StringArray{"x", "y"}},
  		{name: "single element", src: "{solo}", want: StringArray{"solo"}},
  		{name: "quoted element containing comma", src: `{"hello, world",b}`, want: StringArray{"hello, world", "b"}},
  		{name: "escaped double quote inside quoted element", src: `{"a\"b"}`, want: StringArray{`a"b`}},
  		{name: "escaped backslash inside quoted element", src: `{"a\\b"}`, want: StringArray{`a\b`}},
  		{name: "NULL element becomes empty string", src: "{NULL,a}", want: StringArray{"", "a"}},
  		{name: "trailing NULL element becomes empty string", src: "{a,NULL}", want: StringArray{"a", ""}},
  		{name: "empty elements around comma", src: "{,}", want: StringArray{"", ""}},
  		{name: "missing braces is an error", src: "a,b", errMsg: "StringArray.Scan: invalid array format: a,b"},
  		{name: "missing closing brace is an error", src: "{a,b", errMsg: "StringArray.Scan: invalid array format: {a,b"},
  		{name: "unsupported source type is an error", src: 42, errMsg: "StringArray.Scan: expected []byte or string, got int"},
  		{name: "float source type is an error", src: 3.5, errMsg: "StringArray.Scan: expected []byte or string, got float64"},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			// Pre-seed with a non-nil value so we can prove Scan overwrites it.
  			got := StringArray{"pre-existing"}
  			err := got.Scan(tt.src)

  			if tt.errMsg != "" {
  				require.Error(t, err)
  				assert.Equal(t, tt.errMsg, err.Error())
  				return
  			}

  			require.NoError(t, err)
  			if tt.wantNil {
  				assert.Nil(t, got)
  				return
  			}
  			assert.Equal(t, tt.want, got)
  		})
  	}
  }

  func TestStringArray_Value(t *testing.T) {
  	t.Run("nil slice yields nil driver value", func(t *testing.T) {
  		var a StringArray
  		v, err := a.Value()
  		require.NoError(t, err)
  		assert.Nil(t, v)
  	})

  	tests := []struct {
  		name string
  		in   StringArray
  		want string
  	}{
  		{name: "empty non-nil slice", in: StringArray{}, want: "{}"},
  		{name: "plain elements need no quoting", in: StringArray{"a", "b"}, want: "{a,b}"},
  		{name: "element with comma is quoted", in: StringArray{"hello, world"}, want: `{"hello, world"}`},
  		{name: "element with double quote is quoted and escaped", in: StringArray{`a"b`}, want: `{"a\"b"}`},
  		{name: "element with backslash is quoted and escaped", in: StringArray{`a\b`}, want: `{"a\\b"}`},
  		{name: "element with braces is quoted", in: StringArray{"{x}"}, want: `{"{x}"}`},
  		{name: "mixed quoted and unquoted", in: StringArray{"plain", "with,comma"}, want: `{plain,"with,comma"}`},
  		{name: "empty string element", in: StringArray{""}, want: "{}"},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			v, err := tt.in.Value()
  			require.NoError(t, err)
  			assert.Equal(t, tt.want, v)
  		})
  	}
  }

  func TestStringArray_RoundTrip(t *testing.T) {
  	original := StringArray{"plain", "with, comma", `with "quote"`, `with\backslash`}

  	encoded, err := original.Value()
  	require.NoError(t, err)

  	var decoded StringArray
  	require.NoError(t, decoded.Scan(encoded.(string)))
  	assert.Equal(t, original, decoded)
  }

  func TestInt64Array_Scan(t *testing.T) {
  	tests := []struct {
  		name    string
  		src     interface{}
  		want    Int64Array
  		wantNil bool
  		errMsg  string
  	}{
  		{name: "nil source yields nil slice", src: nil, wantNil: true},
  		{name: "empty array literal", src: "{}", want: Int64Array{}},
  		{name: "simple elements", src: "{1,2,3}", want: Int64Array{1, 2, 3}},
  		{name: "byte slice source", src: []byte("{10,20}"), want: Int64Array{10, 20}},
  		{name: "negative values", src: "{-1,0,5}", want: Int64Array{-1, 0, 5}},
  		{name: "surrounding whitespace is trimmed", src: "{ 1 , 2 }", want: Int64Array{1, 2}},
  		{name: "NULL element becomes zero", src: "{NULL,5}", want: Int64Array{0, 5}},
  		{name: "missing braces is an error", src: "1,2", errMsg: "Int64Array.Scan: invalid array format: 1,2"},
  		{name: "unsupported source type is an error", src: 42, errMsg: "Int64Array.Scan: expected []byte or string, got int"},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			got := Int64Array{99}
  			err := got.Scan(tt.src)

  			if tt.errMsg != "" {
  				require.Error(t, err)
  				assert.Equal(t, tt.errMsg, err.Error())
  				return
  			}

  			require.NoError(t, err)
  			if tt.wantNil {
  				assert.Nil(t, got)
  				return
  			}
  			assert.Equal(t, tt.want, got)
  		})
  	}

  	t.Run("non-numeric element is a wrapped parse error", func(t *testing.T) {
  		var got Int64Array
  		err := got.Scan("{abc}")
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "Int64Array.Scan: failed to parse int64")
  		assert.Contains(t, err.Error(), "abc")
  	})
  }

  func TestInt64Array_Value(t *testing.T) {
  	t.Run("nil slice yields nil driver value", func(t *testing.T) {
  		var a Int64Array
  		v, err := a.Value()
  		require.NoError(t, err)
  		assert.Nil(t, v)
  	})

  	tests := []struct {
  		name string
  		in   Int64Array
  		want string
  	}{
  		{name: "empty non-nil slice", in: Int64Array{}, want: "{}"},
  		{name: "single value", in: Int64Array{7}, want: "{7}"},
  		{name: "multiple values including negative", in: Int64Array{1, -2, 3}, want: "{1,-2,3}"},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			v, err := tt.in.Value()
  			require.NoError(t, err)
  			assert.Equal(t, tt.want, v)
  		})
  	}
  }

  func TestInt64Array_RoundTrip(t *testing.T) {
  	original := Int64Array{-5, 0, 12345}

  	encoded, err := original.Value()
  	require.NoError(t, err)

  	var decoded Int64Array
  	require.NoError(t, decoded.Scan(encoded.(string)))
  	assert.Equal(t, original, decoded)
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/repositories/postgres/ -run 'TestStringArray|TestInt64Array'`
  Expected: this is characterisation of existing behaviour, so most subtests should pass immediately. **Before** creating the file, confirm the baseline: `go test ./internal/adapters/repositories/postgres/` prints `?   github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres  [no test files]` — that "no test files" line is the failing state this task fixes. If any subtest above fails after creation, the expected value in the table is wrong for this codebase: re-derive it from `array_types.go` and fix the *test*, never the production file.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes in this task.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run 'TestStringArray|TestInt64Array' -cover`
  Expected: PASS, and the `coverage:` line is non-zero.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/array_types_test.go
  git commit -m "test: cover StringArray and Int64Array Scan/Value codecs"
  ```

---

### Task 2: Helper and sort-rule tests (`helpers.go`)

**Subagent type:** `go-backend`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/helpers_test.go`

**Interfaces:**
- Consumes: nothing from other tasks — fully independent, run in parallel with Tasks 1, 3, 4, 8, 9.
- Produces: nothing other tasks rely on.

Functions under test, all in `backend/internal/adapters/repositories/postgres/helpers.go`:
- `func (a *JSONBArray) Scan(src interface{}) error` / `func (a JSONBArray) Value() (driver.Value, error)`
- `func contentTypeToDBValue(ct domain.ContentType) string` / `func contentTypeFromDBValue(s string) domain.ContentType`
- `func privacyToDBValue(p domain.Privacy) string` / `func privacyFromDBValue(s string) domain.Privacy`
- `func reviewStatusToDBValue(rs *domain.ReviewStatus) sql.NullString` / `func reviewStatusFromDBValue(s sql.NullString) *domain.ReviewStatus`
- `func intSliceToInt64Array(ints []int) Int64Array`
- `func buildContentSortRules(sortBy domain.ContentSortBy, order domain.SortOrder) []paginator.Rule`
- `func buildPerspectiveSortRules(sortBy domain.PerspectiveSortBy, order domain.SortOrder) []paginator.Rule`

Relevant domain constants (`internal/core/domain`): `ContentTypeYouTube = "YOUTUBE"`, `ContentTypeClaim = "CLAIM"`; `PrivacyPublic = "PUBLIC"`; `ReviewStatusPending/Approved/Rejected = "PENDING"/"APPROVED"/"REJECTED"`; `SortOrderAsc = "ASC"`, `SortOrderDesc = "DESC"`; `ContentSortByCreatedAt/UpdatedAt/Name/ViewCount/LikeCount/PublishedAt/ChannelTitle/Length`; `PerspectiveSortByCreatedAt/UpdatedAt`.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/helpers_test.go`:

  ```go
  package postgres

  import (
  	"database/sql"
  	"testing"

  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  func TestJSONBArray_Scan(t *testing.T) {
  	t.Run("nil source yields nil slice", func(t *testing.T) {
  		got := JSONBArray{"pre-existing"}
  		require.NoError(t, got.Scan(nil))
  		assert.Nil(t, got)
  	})

  	t.Run("empty array literal", func(t *testing.T) {
  		var got JSONBArray
  		require.NoError(t, got.Scan("{}"))
  		assert.Equal(t, JSONBArray{}, got)
  	})

  	t.Run("single quoted json object", func(t *testing.T) {
  		var got JSONBArray
  		require.NoError(t, got.Scan(`{"{\"category\": \"acting\", \"rating\": 5}"}`))
  		assert.Equal(t, JSONBArray{`{"category": "acting", "rating": 5}`}, got)
  	})

  	t.Run("propagates StringArray scan error", func(t *testing.T) {
  		var got JSONBArray
  		err := got.Scan(42)
  		require.Error(t, err)
  		assert.Equal(t, "StringArray.Scan: expected []byte or string, got int", err.Error())
  	})
  }

  func TestJSONBArray_Value(t *testing.T) {
  	t.Run("nil slice yields nil driver value", func(t *testing.T) {
  		var a JSONBArray
  		v, err := a.Value()
  		require.NoError(t, err)
  		assert.Nil(t, v)
  	})

  	t.Run("empty non-nil slice also yields nil driver value", func(t *testing.T) {
  		v, err := JSONBArray{}.Value()
  		require.NoError(t, err)
  		assert.Nil(t, v)
  	})

  	t.Run("json object is quoted and escaped", func(t *testing.T) {
  		v, err := JSONBArray{`{"a":1}`}.Value()
  		require.NoError(t, err)
  		assert.Equal(t, `{"{\"a\":1}"}`, v)
  	})
  }

  func TestContentTypeDBValueConversion(t *testing.T) {
  	assert.Equal(t, "youtube", contentTypeToDBValue(domain.ContentTypeYouTube))
  	assert.Equal(t, "claim", contentTypeToDBValue(domain.ContentTypeClaim))
  	assert.Equal(t, "", contentTypeToDBValue(domain.ContentType("")))

  	assert.Equal(t, domain.ContentTypeYouTube, contentTypeFromDBValue("youtube"))
  	assert.Equal(t, domain.ContentTypeClaim, contentTypeFromDBValue("claim"))
  	assert.Equal(t, domain.ContentTypeYouTube, contentTypeFromDBValue("YouTube"))
  	assert.Equal(t, domain.ContentType(""), contentTypeFromDBValue(""))
  }

  func TestPrivacyDBValueConversion(t *testing.T) {
  	assert.Equal(t, "public", privacyToDBValue(domain.PrivacyPublic))
  	assert.Equal(t, domain.PrivacyPublic, privacyFromDBValue("public"))
  	assert.Equal(t, domain.PrivacyPublic, privacyFromDBValue("PuBLic"))
  	assert.Equal(t, domain.Privacy(""), privacyFromDBValue(""))
  }

  func TestReviewStatusToDBValue(t *testing.T) {
  	t.Run("nil pointer yields invalid NullString", func(t *testing.T) {
  		got := reviewStatusToDBValue(nil)
  		assert.False(t, got.Valid)
  		assert.Equal(t, "", got.String)
  	})

  	t.Run("approved yields lowercase valid NullString", func(t *testing.T) {
  		rs := domain.ReviewStatusApproved
  		got := reviewStatusToDBValue(&rs)
  		assert.True(t, got.Valid)
  		assert.Equal(t, "approved", got.String)
  	})

  	t.Run("pending yields lowercase valid NullString", func(t *testing.T) {
  		rs := domain.ReviewStatusPending
  		got := reviewStatusToDBValue(&rs)
  		assert.True(t, got.Valid)
  		assert.Equal(t, "pending", got.String)
  	})
  }

  func TestReviewStatusFromDBValue(t *testing.T) {
  	t.Run("invalid NullString yields nil", func(t *testing.T) {
  		assert.Nil(t, reviewStatusFromDBValue(sql.NullString{}))
  	})

  	t.Run("valid NullString is uppercased", func(t *testing.T) {
  		got := reviewStatusFromDBValue(sql.NullString{String: "rejected", Valid: true})
  		require.NotNil(t, got)
  		assert.Equal(t, domain.ReviewStatusRejected, *got)
  	})
  }

  func TestIntSliceToInt64Array(t *testing.T) {
  	assert.Nil(t, intSliceToInt64Array(nil))

  	empty := intSliceToInt64Array([]int{})
  	require.NotNil(t, empty)
  	assert.Len(t, empty, 0)

  	assert.Equal(t, Int64Array{1, -2, 3}, intSliceToInt64Array([]int{1, -2, 3}))
  }

  func TestBuildContentSortRules(t *testing.T) {
  	tests := []struct {
  		name         string
  		sortBy       domain.ContentSortBy
  		order        domain.SortOrder
  		wantPrimary  paginator.Rule
  		wantTieOrder paginator.Order
  	}{
  		{
  			name:   "view count ascending uses JSONB SQLRepr with int64 null replacement",
  			sortBy: domain.ContentSortByViewCount,
  			order:  domain.SortOrderAsc,
  			wantPrimary: paginator.Rule{
  				Key:             "ViewCount",
  				Order:           paginator.ASC,
  				SQLRepr:         "(response->'items'->0->'statistics'->>'viewCount')::BIGINT",
  				NULLReplacement: int64(0),
  			},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			name:   "like count descending",
  			sortBy: domain.ContentSortByLikeCount,
  			order:  domain.SortOrderDesc,
  			wantPrimary: paginator.Rule{
  				Key:             "LikeCount",
  				Order:           paginator.DESC,
  				SQLRepr:         "(response->'items'->0->'statistics'->>'likeCount')::BIGINT",
  				NULLReplacement: int64(0),
  			},
  			wantTieOrder: paginator.DESC,
  		},
  		{
  			name:   "published at uses string null replacement",
  			sortBy: domain.ContentSortByPublishedAt,
  			order:  domain.SortOrderAsc,
  			wantPrimary: paginator.Rule{
  				Key:             "PublishedAt",
  				Order:           paginator.ASC,
  				SQLRepr:         "response->'items'->0->'snippet'->>'publishedAt'",
  				NULLReplacement: "",
  			},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			name:   "channel title uses string null replacement",
  			sortBy: domain.ContentSortByChannelTitle,
  			order:  domain.SortOrderDesc,
  			wantPrimary: paginator.Rule{
  				Key:             "ChannelTitle",
  				Order:           paginator.DESC,
  				SQLRepr:         "response->'items'->0->'snippet'->>'channelTitle'",
  				NULLReplacement: "",
  			},
  			wantTieOrder: paginator.DESC,
  		},
  		{
  			name:         "length has no SQLRepr but has int64 null replacement",
  			sortBy:       domain.ContentSortByLength,
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "Length", Order: paginator.ASC, NULLReplacement: int64(0)},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			name:         "updated at is a plain column rule",
  			sortBy:       domain.ContentSortByUpdatedAt,
  			order:        domain.SortOrderDesc,
  			wantPrimary:  paginator.Rule{Key: "UpdatedAt", Order: paginator.DESC},
  			wantTieOrder: paginator.DESC,
  		},
  		{
  			name:         "name is a plain column rule",
  			sortBy:       domain.ContentSortByName,
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "Name", Order: paginator.ASC},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			name:         "created at is a plain column rule",
  			sortBy:       domain.ContentSortByCreatedAt,
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.ASC},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			// Regression guard: the default branch hard-codes DESC on the primary rule
  			// but the tie-breaker still follows the requested order.
  			name:         "unknown sort key falls back to CreatedAt DESC with requested tie-breaker order",
  			sortBy:       domain.ContentSortBy("NOT_A_REAL_SORT_KEY"),
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
  			wantTieOrder: paginator.ASC,
  		},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			rules := buildContentSortRules(tt.sortBy, tt.order)
  			require.Len(t, rules, 2)
  			assert.Equal(t, tt.wantPrimary, rules[0])
  			assert.Equal(t, paginator.Rule{Key: "ID", Order: tt.wantTieOrder}, rules[1])
  		})
  	}
  }

  func TestBuildPerspectiveSortRules(t *testing.T) {
  	tests := []struct {
  		name         string
  		sortBy       domain.PerspectiveSortBy
  		order        domain.SortOrder
  		wantPrimary  paginator.Rule
  		wantTieOrder paginator.Order
  	}{
  		{
  			name:         "updated at ascending",
  			sortBy:       domain.PerspectiveSortByUpdatedAt,
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "UpdatedAt", Order: paginator.ASC},
  			wantTieOrder: paginator.ASC,
  		},
  		{
  			name:         "created at descending",
  			sortBy:       domain.PerspectiveSortByCreatedAt,
  			order:        domain.SortOrderDesc,
  			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
  			wantTieOrder: paginator.DESC,
  		},
  		{
  			name:         "unknown sort key falls back to CreatedAt DESC with requested tie-breaker order",
  			sortBy:       domain.PerspectiveSortBy("NOT_A_REAL_SORT_KEY"),
  			order:        domain.SortOrderAsc,
  			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
  			wantTieOrder: paginator.ASC,
  		},
  	}

  	for _, tt := range tests {
  		t.Run(tt.name, func(t *testing.T) {
  			rules := buildPerspectiveSortRules(tt.sortBy, tt.order)
  			require.Len(t, rules, 2)
  			assert.Equal(t, tt.wantPrimary, rules[0])
  			assert.Equal(t, paginator.Rule{Key: "ID", Order: tt.wantTieOrder}, rules[1])
  		})
  	}
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Baseline first (from `backend/`): `go test ./internal/adapters/repositories/postgres/`
  Expected before creating the file: `?   .../internal/adapters/repositories/postgres  [no test files]`.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run 'TestJSONBArray|TestContentType|TestPrivacy|TestReviewStatus|TestIntSlice|TestBuild' -cover`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/helpers_test.go
  git commit -m "test: cover postgres enum converters, JSONBArray, and cursor sort-rule builders"
  ```

---

### Task 3: Domain↔GORM mapper and model tests

**Subagent type:** `go-backend`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_mappers_test.go`
- Create: `backend/internal/adapters/repositories/postgres/gorm_models_test.go`

**Interfaces:**
- Consumes: nothing from other tasks — fully independent, run in parallel with Tasks 1, 2, 4, 8, 9.
- Produces: nothing other tasks rely on.

Functions under test in `gorm_mappers.go`: `userModelToDomain`, `userDomainToModel`, `categoryModelToDomain`, `categoryDomainToModel`, `contentModelToDomain`, `contentDomainToModel`, `perspectiveModelToDomain`, `perspectiveDomainToModel`. In `gorm_models.go`: `UserModel.TableName`, `CategoryModel.TableName`, `ContentModel.TableName`, `PerspectiveModel.TableName`.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/gorm_models_test.go`:

  ```go
  package postgres

  import (
  	"testing"

  	"github.com/stretchr/testify/assert"
  )

  func TestGormModelTableNames(t *testing.T) {
  	assert.Equal(t, "users", UserModel{}.TableName())
  	assert.Equal(t, "categories", CategoryModel{}.TableName())
  	assert.Equal(t, "content", ContentModel{}.TableName())
  	assert.Equal(t, "perspectives", PerspectiveModel{}.TableName())
  }
  ```

  Create `backend/internal/adapters/repositories/postgres/gorm_mappers_test.go`:

  ```go
  package postgres

  import (
  	"encoding/json"
  	"testing"
  	"time"

  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  func strPtr(s string) *string { return &s }
  func intPtr(i int) *int       { return &i }

  var mapperFixedTime = time.Date(2026, 3, 14, 15, 9, 26, 0, time.UTC)

  // --- User ---

  func TestUserModelToDomain(t *testing.T) {
  	t.Run("nil model yields nil domain", func(t *testing.T) {
  		assert.Nil(t, userModelToDomain(nil))
  	})

  	t.Run("all fields populated, role uppercased", func(t *testing.T) {
  		got := userModelToDomain(&UserModel{
  			ID:          7,
  			ClerkUserID: strPtr("user_abc"),
  			Username:    "alice",
  			Email:       strPtr("alice@example.com"),
  			Role:        "admin",
  			Active:      true,
  			CreatedAt:   mapperFixedTime,
  			UpdatedAt:   mapperFixedTime,
  		})
  		require.NotNil(t, got)
  		assert.Equal(t, &domain.User{
  			ID:          7,
  			ClerkUserID: "user_abc",
  			Username:    "alice",
  			Email:       "alice@example.com",
  			Role:        domain.UserRoleAdmin,
  			Active:      true,
  			CreatedAt:   mapperFixedTime,
  			UpdatedAt:   mapperFixedTime,
  		}, got)
  	})

  	t.Run("nil email and clerk id become empty strings", func(t *testing.T) {
  		got := userModelToDomain(&UserModel{ID: 1, Username: "bob", Role: "default", Active: false})
  		require.NotNil(t, got)
  		assert.Equal(t, "", got.Email)
  		assert.Equal(t, "", got.ClerkUserID)
  		assert.Equal(t, domain.UserRoleDefault, got.Role)
  		assert.False(t, got.Active)
  	})
  }

  func TestUserDomainToModel(t *testing.T) {
  	t.Run("nil domain yields nil model", func(t *testing.T) {
  		assert.Nil(t, userDomainToModel(nil))
  	})

  	t.Run("all fields populated, role lowercased, timestamps left to GORM", func(t *testing.T) {
  		got := userDomainToModel(&domain.User{
  			ID:          7,
  			ClerkUserID: "user_abc",
  			Username:    "alice",
  			Email:       "alice@example.com",
  			Role:        domain.UserRoleSentinel,
  			Active:      true,
  			CreatedAt:   mapperFixedTime,
  			UpdatedAt:   mapperFixedTime,
  		})
  		require.NotNil(t, got)
  		assert.Equal(t, 7, got.ID)
  		require.NotNil(t, got.ClerkUserID)
  		assert.Equal(t, "user_abc", *got.ClerkUserID)
  		require.NotNil(t, got.Email)
  		assert.Equal(t, "alice@example.com", *got.Email)
  		assert.Equal(t, "sentinel", got.Role)
  		assert.True(t, got.Active)
  		assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
  		assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
  	})

  	t.Run("empty email and clerk id become nil pointers", func(t *testing.T) {
  		got := userDomainToModel(&domain.User{ID: 2, Username: "bob", Role: domain.UserRoleDefault})
  		require.NotNil(t, got)
  		assert.Nil(t, got.Email)
  		assert.Nil(t, got.ClerkUserID)
  		assert.Equal(t, "default", got.Role)
  	})
  }

  // --- Category ---

  func TestCategoryMappers(t *testing.T) {
  	assert.Nil(t, categoryModelToDomain(nil))
  	assert.Nil(t, categoryDomainToModel(nil))

  	model := &CategoryModel{
  		ID:          3,
  		WikidataQID: "Q42",
  		Label:       "Douglas Adams",
  		Description: "English author",
  		EntityType:  "human",
  		CreatedAt:   mapperFixedTime,
  		UpdatedAt:   mapperFixedTime,
  	}
  	gotDomain := categoryModelToDomain(model)
  	require.NotNil(t, gotDomain)
  	assert.Equal(t, &domain.Category{
  		ID:          3,
  		WikidataQID: "Q42",
  		Label:       "Douglas Adams",
  		Description: "English author",
  		EntityType:  "human",
  		CreatedAt:   mapperFixedTime,
  		UpdatedAt:   mapperFixedTime,
  	}, gotDomain)

  	gotModel := categoryDomainToModel(gotDomain)
  	require.NotNil(t, gotModel)
  	assert.Equal(t, 3, gotModel.ID)
  	assert.Equal(t, "Q42", gotModel.WikidataQID)
  	assert.Equal(t, "Douglas Adams", gotModel.Label)
  	assert.Equal(t, "English author", gotModel.Description)
  	assert.Equal(t, "human", gotModel.EntityType)
  	assert.True(t, gotModel.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
  	assert.True(t, gotModel.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
  }

  // --- Content ---

  func TestContentModelToDomain(t *testing.T) {
  	assert.Nil(t, contentModelToDomain(nil))

  	got := contentModelToDomain(&ContentModel{
  		ID:                11,
  		Name:              "Some Video",
  		URL:               strPtr("https://youtube.com/watch?v=abc"),
  		ContentType:       "youtube",
  		AddedByUserID:     4,
  		Length:            intPtr(300),
  		LengthUnits:       strPtr("seconds"),
  		Response:          json.RawMessage(`{"items":[]}`),
  		PrimaryCategoryID: intPtr(9),
  		CreatedAt:         mapperFixedTime,
  		UpdatedAt:         mapperFixedTime,
  	})
  	require.NotNil(t, got)
  	assert.Equal(t, 11, got.ID)
  	assert.Equal(t, "Some Video", got.Name)
  	assert.Equal(t, domain.ContentTypeYouTube, got.ContentType, "content_type must be uppercased into the domain enum")
  	assert.Equal(t, 4, got.AddedByUserID)
  	assert.Equal(t, json.RawMessage(`{"items":[]}`), got.Response)
  	require.NotNil(t, got.PrimaryCategoryID)
  	assert.Equal(t, 9, *got.PrimaryCategoryID)
  	assert.Equal(t, mapperFixedTime, got.CreatedAt)
  }

  func TestContentDomainToModel(t *testing.T) {
  	assert.Nil(t, contentDomainToModel(nil))

  	got := contentDomainToModel(&domain.Content{
  		ID:            11,
  		Name:          "Some Video",
  		ContentType:   domain.ContentTypeClaim,
  		AddedByUserID: 4,
  		CreatedAt:     mapperFixedTime,
  		UpdatedAt:     mapperFixedTime,
  	})
  	require.NotNil(t, got)
  	assert.Equal(t, "claim", got.ContentType, "content type must be lowercased for storage")
  	assert.Nil(t, got.URL)
  	assert.Nil(t, got.Length)
  	assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
  	assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
  }

  // --- Perspective ---

  func TestPerspectiveModelToDomain(t *testing.T) {
  	t.Run("nil model yields nil domain", func(t *testing.T) {
  		assert.Nil(t, perspectiveModelToDomain(nil))
  	})

  	t.Run("nil privacy defaults to PUBLIC", func(t *testing.T) {
  		got := perspectiveModelToDomain(&PerspectiveModel{ID: 1, UserID: 2})
  		require.NotNil(t, got)
  		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
  		assert.Nil(t, got.ReviewStatus)
  		assert.Nil(t, got.Parts)
  		assert.Nil(t, got.Labels)
  		assert.Nil(t, got.CategorizedRatings)
  		assert.Nil(t, got.RelatedPerspectiveIDs)
  	})

  	t.Run("full model maps every field with case conversion", func(t *testing.T) {
  		got := perspectiveModelToDomain(&PerspectiveModel{
  			ID:                    5,
  			UserID:                2,
  			ContentID:             intPtr(11),
  			Like:                  strPtr("loved it"),
  			Quality:               intPtr(9000),
  			Agreement:             intPtr(8000),
  			Importance:            intPtr(7000),
  			Confidence:            intPtr(6000),
  			Privacy:               strPtr("public"),
  			Parts:                 Int64Array{1, 2, 3},
  			Category:              strPtr("film"),
  			Labels:                StringArray{"a", "b"},
  			Description:           strPtr("desc"),
  			ReviewStatus:          strPtr("approved"),
  			CategorizedRatings:    JSONBArray{`{"category":"acting","rating":7}`},
  			PrimaryPerspectiveID:  intPtr(4),
  			RelatedPerspectiveIDs: Int64Array{10, 20},
  			CustomFields:          json.RawMessage(`{"k":"v"}`),
  			Review:                strPtr("review text"),
  			CreatedAt:             mapperFixedTime,
  			UpdatedAt:             mapperFixedTime,
  		})
  		require.NotNil(t, got)
  		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
  		require.NotNil(t, got.ReviewStatus)
  		assert.Equal(t, domain.ReviewStatusApproved, *got.ReviewStatus)
  		assert.Equal(t, []int{1, 2, 3}, got.Parts)
  		assert.Equal(t, []string{"a", "b"}, got.Labels)
  		assert.Equal(t, []domain.CategorizedRating{{Category: "acting", Rating: 7}}, got.CategorizedRatings)
  		require.NotNil(t, got.PrimaryPerspectiveID)
  		assert.Equal(t, 4, *got.PrimaryPerspectiveID)
  		assert.Equal(t, []int{10, 20}, got.RelatedPerspectiveIDs)
  		assert.Equal(t, json.RawMessage(`{"k":"v"}`), got.CustomFields)
  		require.NotNil(t, got.Review)
  		assert.Equal(t, "review text", *got.Review)
  		assert.Equal(t, mapperFixedTime, got.CreatedAt)
  	})

  	t.Run("invalid categorized rating json is skipped, valid entries survive", func(t *testing.T) {
  		got := perspectiveModelToDomain(&PerspectiveModel{
  			ID:     6,
  			UserID: 2,
  			CategorizedRatings: JSONBArray{
  				`not json at all`,
  				`{"category":"plot","rating":3}`,
  			},
  		})
  		require.NotNil(t, got)
  		assert.Equal(t, []domain.CategorizedRating{{Category: "plot", Rating: 3}}, got.CategorizedRatings)
  	})
  }

  func TestPerspectiveDomainToModel(t *testing.T) {
  	t.Run("nil domain yields nil model", func(t *testing.T) {
  		assert.Nil(t, perspectiveDomainToModel(nil))
  	})

  	t.Run("privacy is always written as a non-nil lowercase pointer", func(t *testing.T) {
  		got := perspectiveDomainToModel(&domain.Perspective{ID: 1, UserID: 2, Privacy: domain.PrivacyPublic})
  		require.NotNil(t, got)
  		require.NotNil(t, got.Privacy)
  		assert.Equal(t, "public", *got.Privacy)

  		empty := perspectiveDomainToModel(&domain.Perspective{ID: 1, UserID: 2})
  		require.NotNil(t, empty.Privacy, "Privacy pointer is set unconditionally, even for the zero value")
  		assert.Equal(t, "", *empty.Privacy)
  	})

  	t.Run("full domain maps every field with case conversion", func(t *testing.T) {
  		rs := domain.ReviewStatusPending
  		got := perspectiveDomainToModel(&domain.Perspective{
  			ID:                    5,
  			UserID:                2,
  			ContentID:             intPtr(11),
  			Like:                  strPtr("loved it"),
  			Quality:               intPtr(9000),
  			Agreement:             intPtr(8000),
  			Importance:            intPtr(7000),
  			Confidence:            intPtr(6000),
  			Privacy:               domain.PrivacyPublic,
  			Description:           strPtr("desc"),
  			Category:              strPtr("film"),
  			ReviewStatus:          &rs,
  			Parts:                 []int{1, 2, 3},
  			Labels:                []string{"a", "b"},
  			CategorizedRatings:    []domain.CategorizedRating{{Category: "acting", Rating: 7}},
  			PrimaryPerspectiveID:  intPtr(4),
  			RelatedPerspectiveIDs: []int{10, 20},
  			CustomFields:          json.RawMessage(`{"k":"v"}`),
  			Review:                strPtr("review text"),
  			CreatedAt:             mapperFixedTime,
  			UpdatedAt:             mapperFixedTime,
  		})
  		require.NotNil(t, got)
  		require.NotNil(t, got.ReviewStatus)
  		assert.Equal(t, "pending", *got.ReviewStatus)
  		assert.Equal(t, Int64Array{1, 2, 3}, got.Parts)
  		assert.Equal(t, StringArray{"a", "b"}, got.Labels)
  		assert.Equal(t, JSONBArray{`{"category":"acting","rating":7}`}, got.CategorizedRatings)
  		assert.Equal(t, Int64Array{10, 20}, got.RelatedPerspectiveIDs)
  		assert.Equal(t, json.RawMessage(`{"k":"v"}`), got.CustomFields)
  		assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
  		assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
  	})
  }

  func TestPerspectiveMappers_RoundTrip(t *testing.T) {
  	rs := domain.ReviewStatusRejected
  	original := &domain.Perspective{
  		ID:                    5,
  		UserID:                2,
  		ContentID:             intPtr(11),
  		Privacy:               domain.PrivacyPublic,
  		ReviewStatus:          &rs,
  		Parts:                 []int{1, 2},
  		Labels:                []string{"x"},
  		CategorizedRatings:    []domain.CategorizedRating{{Category: "pace", Rating: 4}},
  		RelatedPerspectiveIDs: []int{3},
  		CustomFields:          json.RawMessage(`{"a":1}`),
  	}

  	roundTripped := perspectiveModelToDomain(perspectiveDomainToModel(original))
  	require.NotNil(t, roundTripped)

  	assert.Equal(t, original.ID, roundTripped.ID)
  	assert.Equal(t, original.UserID, roundTripped.UserID)
  	assert.Equal(t, original.Privacy, roundTripped.Privacy)
  	require.NotNil(t, roundTripped.ReviewStatus)
  	assert.Equal(t, *original.ReviewStatus, *roundTripped.ReviewStatus)
  	assert.Equal(t, original.Parts, roundTripped.Parts)
  	assert.Equal(t, original.Labels, roundTripped.Labels)
  	assert.Equal(t, original.CategorizedRatings, roundTripped.CategorizedRatings)
  	assert.Equal(t, original.RelatedPerspectiveIDs, roundTripped.RelatedPerspectiveIDs)
  }
  ```

  **Note for the executor:** `strPtr` and `intPtr` are declared here at package scope. Tasks 5–7 also need pointer helpers; they must **reuse these** (same package) rather than redeclaring them — see each of those tasks' "Consumes" field.

- [ ] **Step 2: Run test to verify it fails**
  Baseline (from `backend/`): `go test ./internal/adapters/repositories/postgres/`
  Expected before creating the files: `?   .../internal/adapters/repositories/postgres  [no test files]`.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run 'TestGormModelTableNames|TestUser|TestCategoryMappers|TestContent|TestPerspective' -cover`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/gorm_mappers_test.go backend/internal/adapters/repositories/postgres/gorm_models_test.go
  git commit -m "test: cover domain<->GORM mappers and model table names"
  ```

---

### Task 4: sqlmock test harness for GORM repositories

**Subagent type:** `go-backend`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/testsupport_test.go`
- Modify: `backend/go.mod` (add `github.com/DATA-DOG/go-sqlmock` to the `require` block)
- Modify: `backend/go.sum` (regenerated)

**Interfaces:**
- Consumes: nothing from other tasks — run in parallel with Tasks 1, 2, 3, 8, 9.
- Produces (Tasks 5, 6 and 7 depend on these exact signatures):
  - `func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock)`
  - `func assertAllExpectationsMet(t *testing.T, mock sqlmock.Sqlmock)`

- [ ] **Step 1: Write the failing test**

  First add the dependency (requires network access to `proxy.golang.org`):
  ```bash
  go get github.com/DATA-DOG/go-sqlmock@v1.5.2
  ```
  ```bash
  go mod tidy
  ```
  Confirm `github.com/DATA-DOG/go-sqlmock v1.5.2` now appears in `backend/go.mod`.

  Then create `backend/internal/adapters/repositories/postgres/testsupport_test.go`:

  ```go
  package postgres

  import (
  	"testing"

  	"github.com/DATA-DOG/go-sqlmock"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  	gormpg "gorm.io/driver/postgres"
  	"gorm.io/gorm"
  	"gorm.io/gorm/logger"
  )

  // newMockDB returns a *gorm.DB backed by a go-sqlmock *sql.DB.
  //
  // Three gorm.Config settings are load-bearing and must not be changed:
  //   - DisableAutomaticPing: gorm.Open pings ConnPool at open time; sqlmock would
  //     report "call to Ping was not expected".
  //   - SkipDefaultTransaction: without it every Create/Update/Delete is wrapped in
  //     BEGIN/COMMIT and each test would need ExpectBegin/ExpectCommit.
  //   - Logger silent: GORM otherwise prints every statement plus every
  //     ErrRecordNotFound as a warning, which is expected in these tests.
  //
  // gorm.io/driver/postgres performs no network round-trip during Initialize when
  // Config.Conn is set, so no real database is required.
  //
  // QueryMatcherRegexp is used because GORM emits quoted identifiers
  // (`SELECT * FROM "users" WHERE ...`); the default matcher requires exact
  // whitespace-normalised equality, which is far too brittle here. Expectation
  // patterns are unanchored Go regexps, so remember to escape `(`, `)`, `*`, `?`
  // and `.` — or match on a distinctive substring instead.
  func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
  	t.Helper()

  	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
  	require.NoError(t, err)
  	t.Cleanup(func() { _ = sqlDB.Close() })

  	gdb, err := gorm.Open(
  		gormpg.New(gormpg.Config{Conn: sqlDB}),
  		&gorm.Config{
  			DisableAutomaticPing:   true,
  			SkipDefaultTransaction: true,
  			Logger:                 logger.Default.LogMode(logger.Silent),
  		},
  	)
  	require.NoError(t, err)

  	return gdb, mock
  }

  // assertAllExpectationsMet fails the test if any queued sqlmock expectation was
  // never consumed — this is what proves the repository actually issued the query.
  func assertAllExpectationsMet(t *testing.T, mock sqlmock.Sqlmock) {
  	t.Helper()
  	assert.NoError(t, mock.ExpectationsWereMet())
  }

  func TestNewMockDB_OpensWithoutARealDatabase(t *testing.T) {
  	db, mock := newMockDB(t)
  	require.NotNil(t, db)
  	require.NotNil(t, mock)

  	mock.ExpectQuery(`SELECT \* FROM "users"`).
  		WillReturnRows(sqlmock.NewRows([]string{"id", "username", "role", "active"}).
  			AddRow(1, "alice", "admin", true))

  	var got UserModel
  	require.NoError(t, db.Where("id = ?", 1).First(&got).Error)

  	assert.Equal(t, 1, got.ID)
  	assert.Equal(t, "alice", got.Username)
  	assert.Equal(t, "admin", got.Role)
  	assert.True(t, got.Active)
  	assertAllExpectationsMet(t, mock)
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`, **before** adding the dependency): `go test ./internal/adapters/repositories/postgres/ -run TestNewMockDB`
  Expected: FAIL with `no required module provides package github.com/DATA-DOG/go-sqlmock`.

- [ ] **Step 3: Write minimal implementation**
  None beyond the `go get` above. No production code changes.

  **Troubleshooting (read before escalating):**
  - `call to Ping was not expected` → `DisableAutomaticPing: true` is missing from `gorm.Config`.
  - `call to database transaction Begin was not expected` → `SkipDefaultTransaction: true` is missing.
  - `Query ... does not match regex` → the expectation pattern contains unescaped regexp metacharacters; the error prints the actual SQL — copy a distinctive literal substring from it and escape `(`, `)`, `*`, `.`, `?`, `$`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run TestNewMockDB -v`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/go.mod backend/go.sum backend/internal/adapters/repositories/postgres/testsupport_test.go
  git commit -m "test: add go-sqlmock-backed GORM harness for repository tests"
  ```

---

### Task 5: `GormUserRepository` tests

**Subagent type:** `db-migration`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_user_repository_test.go`
- Test: same file

**Interfaces:**
- Consumes (**hard dependency — Task 4 must be committed first**):
  - `func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock)` from `testsupport_test.go`
  - `func assertAllExpectationsMet(t *testing.T, mock sqlmock.Sqlmock)` from `testsupport_test.go`
  - Optionally `strPtr`/`intPtr` from Task 3's `gorm_mappers_test.go` — **do not redeclare them**; if Task 3 is not yet merged, use inline `func(s string) *string { return &s }(...)` or declare locally-named helpers (`userStrPtr`) to avoid a redeclaration conflict.
- Produces: nothing other tasks rely on.

Methods under test in `gorm_user_repository.go` (`*GormUserRepository`, constructed via `NewGormUserRepository(db *gorm.DB) *GormUserRepository`): `Create`, `GetByID`, `GetByClerkID`, `GetByUsername`, `GetByEmail`, `ListAll`, `Update`, `Delete`, `CreateFromClerk`, `UpdateByClerkID`, `DeactivateByClerkID`.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/gorm_user_repository_test.go`:

  ```go
  package postgres

  import (
  	"context"
  	"errors"
  	"testing"
  	"time"

  	"github.com/DATA-DOG/go-sqlmock"
  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  var userRepoTime = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

  func userRows() *sqlmock.Rows {
  	return sqlmock.NewRows([]string{
  		"id", "clerk_user_id", "username", "email", "role", "active", "created_at", "updated_at",
  	})
  }

  func TestGormUserRepository_GetByID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns mapped domain user", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		repo := NewGormUserRepository(db)

  		mock.ExpectQuery(`SELECT \* FROM "users"`).
  			WillReturnRows(userRows().AddRow(7, "user_abc", "alice", "alice@example.com", "admin", true, userRepoTime, userRepoTime))

  		got, err := repo.GetByID(ctx, 7)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 7, got.ID)
  		assert.Equal(t, "user_abc", got.ClerkUserID)
  		assert.Equal(t, "alice", got.Username)
  		assert.Equal(t, "alice@example.com", got.Email)
  		assert.Equal(t, domain.UserRoleAdmin, got.Role)
  		assert.True(t, got.Active)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("translates gorm.ErrRecordNotFound to domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		repo := NewGormUserRepository(db)

  		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

  		got, err := repo.GetByID(ctx, 404)
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates non-not-found driver errors verbatim", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		repo := NewGormUserRepository(db)

  		boom := errors.New("connection reset by peer")
  		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(boom)

  		got, err := repo.GetByID(ctx, 7)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.False(t, errors.Is(err, domain.ErrNotFound))
  		assert.Contains(t, err.Error(), "connection reset by peer")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_GetByLookupColumns(t *testing.T) {
  	ctx := context.Background()

  	lookups := []struct {
  		name string
  		call func(repo *GormUserRepository) (*domain.User, error)
  	}{
  		{"GetByClerkID", func(r *GormUserRepository) (*domain.User, error) { return r.GetByClerkID(ctx, "user_abc") }},
  		{"GetByUsername", func(r *GormUserRepository) (*domain.User, error) { return r.GetByUsername(ctx, "alice") }},
  		{"GetByEmail", func(r *GormUserRepository) (*domain.User, error) { return r.GetByEmail(ctx, "alice@example.com") }},
  	}

  	for _, lk := range lookups {
  		t.Run(lk.name+" returns mapped user", func(t *testing.T) {
  			db, mock := newMockDB(t)
  			mock.ExpectQuery(`SELECT \* FROM "users"`).
  				WillReturnRows(userRows().AddRow(7, "user_abc", "alice", "alice@example.com", "default", true, userRepoTime, userRepoTime))

  			got, err := lk.call(NewGormUserRepository(db))
  			require.NoError(t, err)
  			require.NotNil(t, got)
  			assert.Equal(t, "alice", got.Username)
  			assert.Equal(t, domain.UserRoleDefault, got.Role)
  			assertAllExpectationsMet(t, mock)
  		})

  		t.Run(lk.name+" maps empty result to domain.ErrNotFound", func(t *testing.T) {
  			db, mock := newMockDB(t)
  			mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

  			got, err := lk.call(NewGormUserRepository(db))
  			assert.Nil(t, got)
  			assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  			assertAllExpectationsMet(t, mock)
  		})

  		t.Run(lk.name+" propagates driver errors", func(t *testing.T) {
  			db, mock := newMockDB(t)
  			mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(errors.New("boom"))

  			got, err := lk.call(NewGormUserRepository(db))
  			assert.Nil(t, got)
  			require.Error(t, err)
  			assert.Contains(t, err.Error(), "boom")
  			assertAllExpectationsMet(t, mock)
  		})
  	}
  }

  func TestGormUserRepository_ListAll(t *testing.T) {
  	ctx := context.Background()

  	t.Run("maps every row and excludes sentinel users at the SQL level", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		repo := NewGormUserRepository(db)

  		mock.ExpectQuery(`SELECT \* FROM "users" WHERE role != .* ORDER BY username ASC`).
  			WillReturnRows(userRows().
  				AddRow(1, "user_a", "alice", "alice@example.com", "admin", true, userRepoTime, userRepoTime).
  				AddRow(2, nil, "bob", nil, "default", false, userRepoTime, userRepoTime))

  		got, err := repo.ListAll(ctx)
  		require.NoError(t, err)
  		require.Len(t, got, 2)
  		assert.Equal(t, "alice", got[0].Username)
  		assert.Equal(t, domain.UserRoleAdmin, got[0].Role)
  		assert.Equal(t, "bob", got[1].Username)
  		assert.Equal(t, "", got[1].Email, "NULL email must map to empty string")
  		assert.Equal(t, "", got[1].ClerkUserID, "NULL clerk_user_id must map to empty string")
  		assert.False(t, got[1].Active)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("empty result yields empty non-nil slice and no error", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnRows(userRows())

  		got, err := NewGormUserRepository(db).ListAll(ctx)
  		require.NoError(t, err)
  		assert.Len(t, got, 0)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates driver errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(errors.New("list boom"))

  		got, err := NewGormUserRepository(db).ListAll(ctx)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "list boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_Create(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns the created user with GORM-populated id", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		repo := NewGormUserRepository(db)

  		mock.ExpectQuery(`INSERT INTO "users"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(42, userRepoTime, userRepoTime))

  		got, err := repo.Create(ctx, &domain.User{Username: "carol", Email: "carol@example.com", Role: domain.UserRoleDefault, Active: true})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 42, got.ID)
  		assert.Equal(t, "carol", got.Username)
  		assert.Equal(t, "carol@example.com", got.Email)
  		assert.Equal(t, domain.UserRoleDefault, got.Role)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates insert errors unwrapped", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(errors.New("duplicate key value violates unique constraint \"unique_email\""))

  		got, err := NewGormUserRepository(db).Create(ctx, &domain.User{Username: "carol"})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "unique_email")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_CreateFromClerk(t *testing.T) {
  	ctx := context.Background()

  	t.Run("defaults role to default and active to true", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "users"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(15, userRepoTime, userRepoTime))

  		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "dave@example.com")
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 15, got.ID)
  		assert.Equal(t, "user_xyz", got.ClerkUserID)
  		assert.Equal(t, "dave", got.Username)
  		assert.Equal(t, "dave@example.com", got.Email)
  		assert.Equal(t, domain.UserRoleDefault, got.Role)
  		assert.True(t, got.Active)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("empty email is stored as NULL and read back as empty string", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "users"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(16, userRepoTime, userRepoTime))

  		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "")
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, "", got.Email)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates insert errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "users"`).WillReturnError(errors.New("23505"))

  		got, err := NewGormUserRepository(db).CreateFromClerk(ctx, "user_xyz", "dave", "dave@example.com")
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "23505")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_Update(t *testing.T) {
  	ctx := context.Background()

  	t.Run("updates then re-reads the row for fresh timestamps", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
  		mock.ExpectQuery(`SELECT \* FROM "users"`).
  			WillReturnRows(userRows().AddRow(7, "user_abc", "alice2", "alice2@example.com", "admin", true, userRepoTime, userRepoTime))

  		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice2", Email: "alice2@example.com", ClerkUserID: "user_abc", Role: domain.UserRoleAdmin})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, "alice2", got.Username)
  		assert.Equal(t, "alice2@example.com", got.Email)
  		assert.Equal(t, userRepoTime, got.UpdatedAt)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound and no re-read", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 404, Username: "ghost"})
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates update errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnError(errors.New("update boom"))

  		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice"})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "update boom")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates errors from the re-read", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
  		mock.ExpectQuery(`SELECT \* FROM "users"`).WillReturnError(errors.New("reread boom"))

  		got, err := NewGormUserRepository(db).Update(ctx, &domain.User{ID: 7, Username: "alice"})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "reread boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_Delete(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds when one row is removed", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "users"`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormUserRepository(db).Delete(ctx, 7))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "users"`).WillReturnResult(sqlmock.NewResult(0, 0))

  		err := NewGormUserRepository(db).Delete(ctx, 404)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates delete errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "users"`).WillReturnError(errors.New("fk violation"))

  		err := NewGormUserRepository(db).Delete(ctx, 7)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "fk violation")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_UpdateByClerkID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds when one row is updated", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", "alice@example.com"))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("empty email still issues the update", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", ""))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		err := NewGormUserRepository(db).UpdateByClerkID(ctx, "user_missing", "alice", "alice@example.com")
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates update errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnError(errors.New("upd boom"))

  		err := NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", "alice@example.com")
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "upd boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormUserRepository_DeactivateByClerkID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds when one row is deactivated", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_abc"))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		err := NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_missing")
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates update errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "users" SET`).WillReturnError(errors.New("deact boom"))

  		err := NewGormUserRepository(db).DeactivateByClerkID(ctx, "user_abc")
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "deact boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/repositories/postgres/ -run TestGormUserRepository`
  Expected: FAIL — before the file exists, `go test` reports `warning: no tests to run` / `testing: warning: no tests to run` and exits 0 with no `TestGormUserRepository*` output. That absence is the failing state.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

  **Troubleshooting:** if a `Create` assertion fails with `call to ExecQuery '...' was not expected, next expectation is: ExpectedQuery`, swap `ExpectQuery` ↔ `ExpectExec` for that statement — GORM's postgres dialector adds a `RETURNING` clause (making an insert a *query*) only when the model has default-valued fields, and the error message shows the exact SQL so the correct choice is unambiguous.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run TestGormUserRepository -cover`
  Expected: PASS, all subtests.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/gorm_user_repository_test.go
  git commit -m "test: cover GormUserRepository CRUD, error mapping, and Clerk sync methods"
  ```

---

### Task 6: `GormContentRepository` and `GormCategoryRepository` tests

**Subagent type:** `db-migration`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go`
- Create: `backend/internal/adapters/repositories/postgres/gorm_category_repository_test.go`

**Interfaces:**
- Consumes (**hard dependency — Task 4 must be committed first**): `newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock)`, `assertAllExpectationsMet(t *testing.T, mock sqlmock.Sqlmock)`.
- Also uses `strPtr`/`intPtr` from Task 3's `gorm_mappers_test.go` if that task is merged. To stay independent of Task 3's merge order, this task declares its own distinctly-named helpers (`cStr`, `cInt`) — see the code. Do **not** name them `strPtr`/`intPtr`.
- Produces: nothing other tasks rely on.

Methods under test — `gorm_content_repository.go` (`NewGormContentRepository(db *gorm.DB) *GormContentRepository`): `Create`, `GetByID`, `GetByURL`, `GetOrCreateByURL`, `UpdateMetadata`, `List`, `ReassignByUser`, `UpdatePrimaryCategoryID`. And `gorm_category_repository.go` (`NewGormCategoryRepository(db *gorm.DB) *GormCategoryRepository`): `Upsert`, `GetByID`.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/gorm_category_repository_test.go`:

  ```go
  package postgres

  import (
  	"context"
  	"errors"
  	"testing"
  	"time"

  	"github.com/DATA-DOG/go-sqlmock"
  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  var catRepoTime = time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)

  func categoryRows() *sqlmock.Rows {
  	return sqlmock.NewRows([]string{
  		"id", "wikidata_qid", "label", "description", "entity_type", "created_at", "updated_at",
  	})
  }

  func TestGormCategoryRepository_GetByID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns mapped category", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "categories"`).
  			WillReturnRows(categoryRows().AddRow(3, "Q42", "Douglas Adams", "English author", "human", catRepoTime, catRepoTime))

  		got, err := NewGormCategoryRepository(db).GetByID(ctx, 3)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, &domain.Category{
  			ID: 3, WikidataQID: "Q42", Label: "Douglas Adams",
  			Description: "English author", EntityType: "human",
  			CreatedAt: catRepoTime, UpdatedAt: catRepoTime,
  		}, got)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "categories"`).WillReturnRows(categoryRows())

  		got, err := NewGormCategoryRepository(db).GetByID(ctx, 404)
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps other driver errors with context", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "categories"`).WillReturnError(errors.New("cat boom"))

  		got, err := NewGormCategoryRepository(db).GetByID(ctx, 3)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to get category by id")
  		assert.Contains(t, err.Error(), "cat boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormCategoryRepository_Upsert(t *testing.T) {
  	ctx := context.Background()
  	input := &domain.Category{WikidataQID: "Q42", Label: "Douglas Adams", Description: "English author", EntityType: "human"}

  	t.Run("upserts on wikidata_qid conflict then re-reads the fresh row", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "categories" .* ON CONFLICT`).
  			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(3))
  		mock.ExpectQuery(`SELECT \* FROM "categories" WHERE wikidata_qid`).
  			WillReturnRows(categoryRows().AddRow(3, "Q42", "Douglas Adams", "English author", "human", catRepoTime, catRepoTime))

  		got, err := NewGormCategoryRepository(db).Upsert(ctx, input)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 3, got.ID)
  		assert.Equal(t, "Q42", got.WikidataQID)
  		assert.Equal(t, catRepoTime, got.UpdatedAt)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps upsert errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "categories"`).WillReturnError(errors.New("upsert boom"))

  		got, err := NewGormCategoryRepository(db).Upsert(ctx, input)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to upsert category")
  		assert.Contains(t, err.Error(), "upsert boom")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps re-read errors distinctly", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "categories"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(3))
  		mock.ExpectQuery(`SELECT \* FROM "categories"`).WillReturnError(errors.New("refetch boom"))

  		got, err := NewGormCategoryRepository(db).Upsert(ctx, input)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to fetch upserted category")
  		assert.Contains(t, err.Error(), "refetch boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }
  ```

  Create `backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go`:

  ```go
  package postgres

  import (
  	"context"
  	"encoding/json"
  	"errors"
  	"testing"
  	"time"

  	"github.com/DATA-DOG/go-sqlmock"
  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  var contentRepoTime = time.Date(2026, 7, 8, 9, 10, 11, 0, time.UTC)

  func cStr(s string) *string { return &s }
  func cInt(i int) *int       { return &i }

  func contentRows() *sqlmock.Rows {
  	return sqlmock.NewRows([]string{
  		"id", "name", "url", "content_type", "added_by_user_id",
  		"length", "length_units", "response", "primary_category_id",
  		"created_at", "updated_at",
  	})
  }

  func TestGormContentRepository_GetByID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns mapped content with uppercased content type", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).
  			WillReturnRows(contentRows().AddRow(
  				11, "Some Video", "https://youtu.be/abc", "youtube", 4,
  				300, "seconds", []byte(`{"items":[]}`), 9,
  				contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).GetByID(ctx, 11)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 11, got.ID)
  		assert.Equal(t, "Some Video", got.Name)
  		assert.Equal(t, domain.ContentTypeYouTube, got.ContentType)
  		assert.Equal(t, 4, got.AddedByUserID)
  		require.NotNil(t, got.Length)
  		assert.Equal(t, 300, *got.Length)
  		require.NotNil(t, got.PrimaryCategoryID)
  		assert.Equal(t, 9, *got.PrimaryCategoryID)
  		assert.JSONEq(t, `{"items":[]}`, string(got.Response))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

  		got, err := NewGormContentRepository(db).GetByID(ctx, 404)
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps other errors with context", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("get boom"))

  		got, err := NewGormContentRepository(db).GetByID(ctx, 11)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to get content by id")
  		assert.Contains(t, err.Error(), "get boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_GetByURL(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns mapped content", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content" WHERE url`).
  			WillReturnRows(contentRows().AddRow(
  				11, "Some Video", "https://youtu.be/abc", "claim", 4,
  				nil, nil, nil, nil, contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://youtu.be/abc")
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, domain.ContentTypeClaim, got.ContentType)
  		assert.Nil(t, got.Length)
  		assert.Nil(t, got.PrimaryCategoryID)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

  		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://missing")
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps other errors with context", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("url boom"))

  		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://x")
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to get content by url")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_Create(t *testing.T) {
  	ctx := context.Background()

  	t.Run("returns created content with GORM-populated id", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(21, contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).Create(ctx, &domain.Content{
  			Name: "New", URL: cStr("https://x"), ContentType: domain.ContentTypeYouTube, AddedByUserID: 4,
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 21, got.ID)
  		assert.Equal(t, "New", got.Name)
  		assert.Equal(t, domain.ContentTypeYouTube, got.ContentType)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps insert errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnError(errors.New("ins boom"))

  		got, err := NewGormContentRepository(db).Create(ctx, &domain.Content{Name: "New"})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to insert content")
  		assert.Contains(t, err.Error(), "ins boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_GetOrCreateByURL(t *testing.T) {
  	ctx := context.Background()
  	newContent := func() *domain.Content {
  		return &domain.Content{Name: "New", URL: cStr("https://x"), ContentType: domain.ContentTypeYouTube, AddedByUserID: 4}
  	}

  	t.Run("fresh insert re-reads by id and reports alreadyExisted=false", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content" .* ON CONFLICT`).
  			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).
  			WillReturnRows(contentRows().AddRow(21, "New", "https://x", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

  		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
  		require.NoError(t, err)
  		assert.False(t, existed)
  		require.NotNil(t, got)
  		assert.Equal(t, 21, got.ID)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("conflict with zero rows affected falls back to lookup by URL and reports alreadyExisted=true", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content" .* ON CONFLICT`).
  			WillReturnRows(sqlmock.NewRows([]string{"id"}))
  		mock.ExpectQuery(`SELECT \* FROM "content" WHERE url`).
  			WillReturnRows(contentRows().AddRow(19, "Existing", "https://x", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

  		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), false)
  		require.NoError(t, err)
  		assert.True(t, existed)
  		require.NotNil(t, got)
  		assert.Equal(t, 19, got.ID)
  		assert.Equal(t, "Existing", got.Name)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps upsert errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnError(errors.New("conflict boom"))

  		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
  		assert.Nil(t, got)
  		assert.False(t, existed)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to upsert content")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps post-conflict lookup errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

  		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), false)
  		assert.Nil(t, got)
  		assert.False(t, existed)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to fetch existing content after conflict")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps post-create re-read errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("post-create boom"))

  		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
  		assert.Nil(t, got)
  		assert.False(t, existed)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to fetch created content")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_UpdateMetadata(t *testing.T) {
  	ctx := context.Background()

  	t.Run("updates then re-reads", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).
  			WillReturnRows(contentRows().AddRow(11, "Refreshed", "https://x", "youtube", 4, 420, "seconds", []byte(`{"a":1}`), nil, contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "Refreshed", json.RawMessage(`{"a":1}`), cInt(420))
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, "Refreshed", got.Name)
  		require.NotNil(t, got.Length)
  		assert.Equal(t, 420, *got.Length)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound and no re-read", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 404, "Refreshed", json.RawMessage(`{}`), nil)
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps update errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("meta boom"))

  		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "x", json.RawMessage(`{}`), nil)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to update content metadata")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps re-read errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("reread boom"))

  		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "x", json.RawMessage(`{}`), nil)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to fetch updated content")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_ReassignByUser(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds even when no rows match", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		assert.NoError(t, NewGormContentRepository(db).ReassignByUser(ctx, 4, 5))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("reassign boom"))

  		err := NewGormContentRepository(db).ReassignByUser(ctx, 4, 5)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "reassign boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_UpdatePrimaryCategoryID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds when one row is updated", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, cInt(9)))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("nil category id clears the FK", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, nil))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		err := NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 404, cInt(9))
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps update errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("cat fk boom"))

  		err := NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, cInt(9))
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to update primary category")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormContentRepository_List(t *testing.T) {
  	ctx := context.Background()

  	t.Run("no filter, default limit, maps rows to domain", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).
  			WillReturnRows(contentRows().
  				AddRow(11, "A", "https://a", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime).
  				AddRow(12, "B", "https://b", "claim", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
  			SortBy:    domain.ContentSortByCreatedAt,
  			SortOrder: domain.SortOrderDesc,
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		require.Len(t, got.Items, 2)
  		assert.Equal(t, "A", got.Items[0].Name)
  		assert.Equal(t, domain.ContentTypeClaim, got.Items[1].ContentType)
  		assert.Nil(t, got.TotalCount, "TotalCount must stay nil when IncludeTotalCount is false")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("IncludeTotalCount issues a separate COUNT query", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT count\(\*\) FROM "content"`).
  			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(37))
  		mock.ExpectQuery(`SELECT \* FROM "content"`).
  			WillReturnRows(contentRows().AddRow(11, "A", "https://a", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

  		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
  			SortBy:            domain.ContentSortByCreatedAt,
  			SortOrder:         domain.SortOrderDesc,
  			IncludeTotalCount: true,
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got.TotalCount)
  		assert.Equal(t, 37, *got.TotalCount)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("count query failure is wrapped and short-circuits", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT count\(\*\) FROM "content"`).WillReturnError(errors.New("count boom"))

  		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{IncludeTotalCount: true})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to count content")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("pagination query failure is wrapped", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("page boom"))

  		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to list content")
  		assertAllExpectationsMet(t, mock)
  	})

  	// Each subtest below drives exactly one branch of the ~20-branch filter chain and
  	// asserts the generated SQL contains that branch's predicate. This is the whole
  	// point of these tests: they are the only thing standing between a typo in a
  	// JSONB path and a silently wrong query.
  	filterCases := []struct {
  		name       string
  		filter     *domain.ContentFilter
  		wantSQLRe  string
  	}{
  		{"content type", &domain.ContentFilter{ContentType: func() *domain.ContentType { ct := domain.ContentTypeYouTube; return &ct }()}, `content_type = `},
  		{"min length", &domain.ContentFilter{MinLengthSeconds: cInt(60)}, `length >= `},
  		{"max length", &domain.ContentFilter{MaxLengthSeconds: cInt(600)}, `length <= `},
  		{"name search", &domain.ContentFilter{Search: cStr("go")}, `name ILIKE `},
  		{"empty name search is ignored", &domain.ContentFilter{Search: cStr("")}, `SELECT \* FROM "content"`},
  		{"min view count", &domain.ContentFilter{MinViewCount: cInt(1000)}, `'statistics'->>'viewCount'.*>= `},
  		{"max view count", &domain.ContentFilter{MaxViewCount: cInt(9000)}, `'statistics'->>'viewCount'.*<= `},
  		{"min like count", &domain.ContentFilter{MinLikeCount: cInt(10)}, `'statistics'->>'likeCount'.*>= `},
  		{"max like count", &domain.ContentFilter{MaxLikeCount: cInt(90)}, `'statistics'->>'likeCount'.*<= `},
  		{"published after", &domain.ContentFilter{PublishedAfter: cStr("2026-01-01")}, `'snippet'->>'publishedAt' >= `},
  		{"published before", &domain.ContentFilter{PublishedBefore: cStr("2026-12-31")}, `'snippet'->>'publishedAt' <= `},
  		{"channel title", &domain.ContentFilter{ChannelTitle: cStr("chan")}, `'snippet'->>'channelTitle' ILIKE `},
  		{"tag contains", &domain.ContentFilter{TagContains: cStr("tag")}, `'snippet'->'tags'.*ILIKE `},
  		{"description search", &domain.ContentFilter{DescriptionSearch: cStr("desc")}, `'snippet'->>'description' ILIKE `},
  		{"created after", &domain.ContentFilter{CreatedAfter: cStr("2026-01-01")}, `created_at >= `},
  		{"created before", &domain.ContentFilter{CreatedBefore: cStr("2026-12-31")}, `created_at <= `},
  		{"updated after", &domain.ContentFilter{UpdatedAfter: cStr("2026-01-01")}, `updated_at >= `},
  		{"updated before", &domain.ContentFilter{UpdatedBefore: cStr("2026-12-31")}, `updated_at <= `},
  	}

  	for _, fc := range filterCases {
  		t.Run("filter: "+fc.name, func(t *testing.T) {
  			db, mock := newMockDB(t)
  			mock.ExpectQuery(fc.wantSQLRe).WillReturnRows(contentRows())

  			got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
  				First:     cInt(5),
  				SortBy:    domain.ContentSortByCreatedAt,
  				SortOrder: domain.SortOrderDesc,
  				Filter:    fc.filter,
  			})
  			require.NoError(t, err)
  			require.NotNil(t, got)
  			assert.Len(t, got.Items, 0)
  			assert.False(t, got.HasNext)
  			assert.False(t, got.HasPrev)
  			assertAllExpectationsMet(t, mock)
  		})
  	}

  	t.Run("all filters combined produce a single query", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		ct := domain.ContentTypeYouTube
  		mock.ExpectQuery(`SELECT \* FROM "content" WHERE`).WillReturnRows(contentRows())

  		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
  			First:     cInt(3),
  			SortBy:    domain.ContentSortByViewCount,
  			SortOrder: domain.SortOrderAsc,
  			Filter: &domain.ContentFilter{
  				ContentType: &ct, MinLengthSeconds: cInt(1), MaxLengthSeconds: cInt(2),
  				Search: cStr("s"), MinViewCount: cInt(3), MaxViewCount: cInt(4),
  				MinLikeCount: cInt(5), MaxLikeCount: cInt(6),
  				PublishedAfter: cStr("2026-01-01"), PublishedBefore: cStr("2026-12-31"),
  				ChannelTitle: cStr("c"), TagContains: cStr("t"), DescriptionSearch: cStr("d"),
  				CreatedAfter: cStr("2026-01-01"), CreatedBefore: cStr("2026-12-31"),
  				UpdatedAfter: cStr("2026-01-01"), UpdatedBefore: cStr("2026-12-31"),
  			},
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Len(t, got.Items, 0)
  		assertAllExpectationsMet(t, mock)
  	})
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/repositories/postgres/ -run 'TestGormContentRepository|TestGormCategoryRepository'`
  Expected: before the files exist, no `TestGormContentRepository*` / `TestGormCategoryRepository*` output at all — that absence is the failing state.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

  **Troubleshooting:** `gorm-cursor-paginator` may emit `SELECT * FROM "content" WHERE ... ORDER BY ... LIMIT ...` with a slightly different shape than expected. If a filter subtest fails with `Query ... does not match regex`, read the *actual* SQL from the sqlmock error and relax that one `wantSQLRe` to a distinctive escaped substring of it. Do not weaken it all the way to `SELECT` — the point is to pin the predicate.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run 'TestGormContentRepository|TestGormCategoryRepository' -cover`
  Expected: PASS, all subtests.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go backend/internal/adapters/repositories/postgres/gorm_category_repository_test.go
  git commit -m "test: cover GormContentRepository filters/upserts and GormCategoryRepository"
  ```

---

### Task 7: `GormPerspectiveRepository` tests

**Subagent type:** `db-migration`

**Files:**
- Create: `backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go`

**Interfaces:**
- Consumes (**hard dependency — Task 4 must be committed first**): `newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock)`, `assertAllExpectationsMet(t *testing.T, mock sqlmock.Sqlmock)`.
- Declares its own pointer helpers named `pStr`/`pInt` to avoid colliding with Task 3's `strPtr`/`intPtr` and Task 6's `cStr`/`cInt`.
- Produces: nothing other tasks rely on.

Methods under test in `gorm_perspective_repository.go` (`NewGormPerspectiveRepository(db *gorm.DB) *GormPerspectiveRepository`): `Create`, `GetByID`, `Update`, `Delete`, `List`, `ReassignByUser`.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go`:

  ```go
  package postgres

  import (
  	"context"
  	"errors"
  	"testing"
  	"time"

  	"github.com/DATA-DOG/go-sqlmock"
  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  var perspRepoTime = time.Date(2026, 9, 10, 11, 12, 13, 0, time.UTC)

  func pStr(s string) *string { return &s }
  func pInt(i int) *int       { return &i }

  func perspectiveRows() *sqlmock.Rows {
  	return sqlmock.NewRows([]string{
  		"id", "user_id", "content_id", "like", "quality", "agreement", "importance",
  		"confidence", "privacy", "parts", "category", "labels", "description",
  		"review_status", "categorized_ratings", "primary_perspective_id",
  		"related_perspective_ids", "custom_fields", "review", "created_at", "updated_at",
  	})
  }

  // fullPerspectiveRow adds one row exercising every array/JSONB column codec.
  func fullPerspectiveRow(rows *sqlmock.Rows, id int) *sqlmock.Rows {
  	return rows.AddRow(
  		id, 2, 11, "loved it", 9000, 8000, 7000,
  		6000, "public", "{1,2,3}", "film", "{a,b}", "desc",
  		"approved", `{"{\"category\":\"acting\",\"rating\":7}"}`, 4,
  		"{10,20}", []byte(`{"k":"v"}`), "review text", perspRepoTime, perspRepoTime,
  	)
  }

  func TestGormPerspectiveRepository_GetByID(t *testing.T) {
  	ctx := context.Background()

  	t.Run("maps every array and JSONB column through the custom codecs", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
  			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

  		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 5)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 5, got.ID)
  		assert.Equal(t, 2, got.UserID)
  		require.NotNil(t, got.ContentID)
  		assert.Equal(t, 11, *got.ContentID)
  		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
  		require.NotNil(t, got.ReviewStatus)
  		assert.Equal(t, domain.ReviewStatusApproved, *got.ReviewStatus)
  		assert.Equal(t, []int{1, 2, 3}, got.Parts)
  		assert.Equal(t, []string{"a", "b"}, got.Labels)
  		assert.Equal(t, []domain.CategorizedRating{{Category: "acting", Rating: 7}}, got.CategorizedRatings)
  		require.NotNil(t, got.PrimaryPerspectiveID)
  		assert.Equal(t, 4, *got.PrimaryPerspectiveID)
  		assert.Equal(t, []int{10, 20}, got.RelatedPerspectiveIDs)
  		assert.JSONEq(t, `{"k":"v"}`, string(got.CustomFields))
  		require.NotNil(t, got.Review)
  		assert.Equal(t, "review text", *got.Review)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("NULL privacy defaults to PUBLIC", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
  			WillReturnRows(perspectiveRows().AddRow(
  				6, 2, nil, nil, nil, nil, nil,
  				nil, nil, nil, nil, nil, nil,
  				nil, nil, nil,
  				nil, nil, nil, perspRepoTime, perspRepoTime))

  		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 6)
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
  		assert.Nil(t, got.ReviewStatus)
  		assert.Nil(t, got.Parts)
  		assert.Nil(t, got.Labels)
  		assert.Nil(t, got.CategorizedRatings)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnRows(perspectiveRows())

  		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 404)
  		assert.Nil(t, got)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps other errors with context", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnError(errors.New("p boom"))

  		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 5)
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to get perspective by id")
  		assert.Contains(t, err.Error(), "p boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormPerspectiveRepository_Create(t *testing.T) {
  	ctx := context.Background()

  	t.Run("inserts then re-reads the created row via GetByID", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "perspectives"`).
  			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(5, perspRepoTime, perspRepoTime))
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
  			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

  		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{
  			UserID: 2, ContentID: pInt(11), Privacy: domain.PrivacyPublic,
  			Parts: []int{1, 2, 3}, Labels: []string{"a", "b"},
  			CategorizedRatings: []domain.CategorizedRating{{Category: "acting", Rating: 7}},
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 5, got.ID)
  		assert.Equal(t, perspRepoTime, got.CreatedAt)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps insert errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`INSERT INTO "perspectives"`).WillReturnError(errors.New("p ins boom"))

  		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{UserID: 2})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to insert perspective")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormPerspectiveRepository_Update(t *testing.T) {
  	ctx := context.Background()

  	t.Run("saves then re-reads the row", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
  			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

  		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{
  			ID: 5, UserID: 2, Privacy: domain.PrivacyPublic, Description: pStr("desc"),
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		assert.Equal(t, 5, got.ID)
  		assert.Equal(t, perspRepoTime, got.UpdatedAt)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps save errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnError(errors.New("p upd boom"))

  		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{ID: 5, UserID: 2})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to update perspective")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormPerspectiveRepository_Delete(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds when one row is removed", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnResult(sqlmock.NewResult(0, 1))

  		assert.NoError(t, NewGormPerspectiveRepository(db).Delete(ctx, 5))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnResult(sqlmock.NewResult(0, 0))

  		err := NewGormPerspectiveRepository(db).Delete(ctx, 404)
  		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("wraps delete errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnError(errors.New("p del boom"))

  		err := NewGormPerspectiveRepository(db).Delete(ctx, 5)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to delete perspective")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormPerspectiveRepository_ReassignByUser(t *testing.T) {
  	ctx := context.Background()

  	t.Run("succeeds even when no rows match", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

  		assert.NoError(t, NewGormPerspectiveRepository(db).ReassignByUser(ctx, 2, 3))
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("propagates errors", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnError(errors.New("p reassign boom"))

  		err := NewGormPerspectiveRepository(db).ReassignByUser(ctx, 2, 3)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "p reassign boom")
  		assertAllExpectationsMet(t, mock)
  	})
  }

  func TestGormPerspectiveRepository_List(t *testing.T) {
  	ctx := context.Background()

  	t.Run("no filter maps rows and leaves TotalCount nil", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
  			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

  		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
  			SortBy:    domain.PerspectiveSortByCreatedAt,
  			SortOrder: domain.SortOrderDesc,
  		})
  		require.NoError(t, err)
  		require.NotNil(t, got)
  		require.Len(t, got.Items, 1)
  		assert.Equal(t, 5, got.Items[0].ID)
  		assert.Equal(t, []int{1, 2, 3}, got.Items[0].Parts)
  		assert.Nil(t, got.TotalCount)
  		assert.False(t, got.HasNext)
  		assert.False(t, got.HasPrev)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("IncludeTotalCount issues a separate COUNT query", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"`).
  			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnRows(perspectiveRows())

  		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{IncludeTotalCount: true})
  		require.NoError(t, err)
  		require.NotNil(t, got.TotalCount)
  		assert.Equal(t, 12, *got.TotalCount)
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("count query failure is wrapped and short-circuits", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"`).WillReturnError(errors.New("p count boom"))

  		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{IncludeTotalCount: true})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to count perspectives")
  		assertAllExpectationsMet(t, mock)
  	})

  	t.Run("pagination query failure is wrapped", func(t *testing.T) {
  		db, mock := newMockDB(t)
  		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnError(errors.New("p page boom"))

  		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{})
  		assert.Nil(t, got)
  		require.Error(t, err)
  		assert.Contains(t, err.Error(), "failed to list perspectives")
  		assertAllExpectationsMet(t, mock)
  	})

  	privacy := domain.PrivacyPublic
  	filterCases := []struct {
  		name      string
  		filter    *domain.PerspectiveFilter
  		wantSQLRe string
  	}{
  		{"user id", &domain.PerspectiveFilter{UserID: pInt(2)}, `user_id = `},
  		{"content id", &domain.PerspectiveFilter{ContentID: pInt(11)}, `content_id = `},
  		{"privacy is lowercased for storage", &domain.PerspectiveFilter{Privacy: &privacy}, `privacy = `},
  	}

  	for _, fc := range filterCases {
  		t.Run("filter: "+fc.name, func(t *testing.T) {
  			db, mock := newMockDB(t)
  			mock.ExpectQuery(fc.wantSQLRe).WillReturnRows(perspectiveRows())

  			got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
  				First:     pInt(5),
  				SortBy:    domain.PerspectiveSortByUpdatedAt,
  				SortOrder: domain.SortOrderAsc,
  				Filter:    fc.filter,
  			})
  			require.NoError(t, err)
  			require.NotNil(t, got)
  			assert.Len(t, got.Items, 0)
  			assertAllExpectationsMet(t, mock)
  		})
  	}
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/repositories/postgres/ -run TestGormPerspectiveRepository`
  Expected: before the file exists, no `TestGormPerspectiveRepository*` output — that absence is the failing state.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

  **Troubleshooting:** if scanning the `parts` / `labels` / `categorized_ratings` columns errors, the row value must be the *PostgreSQL wire text* form (e.g. `"{1,2,3}"`), not a Go slice — the `Int64Array`/`StringArray`/`JSONBArray` `Scan` methods parse that text. The fixtures above are already in that form; keep them that way.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/repositories/postgres/ -run TestGormPerspectiveRepository -cover`
  Expected: PASS, all subtests.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go
  git commit -m "test: cover GormPerspectiveRepository CRUD, list filters, and array column codecs"
  ```

---

### Task 8: Extract `newAuthHandler` and test Clerk middleware user resolution

**Subagent type:** `go-backend`

**Files:**
- Modify: `backend/internal/adapters/auth/clerk_middleware.go` (lines 18–146 — replace the body of `Middleware`)
- Create: `backend/internal/adapters/auth/clerk_middleware_test.go`

**Interfaces:**
- Consumes: nothing from other tasks — fully independent, run in parallel with Tasks 1, 2, 3, 4, 9.
- Produces (Task 9 may reuse the mock repo, but **must not redeclare it** — see below):
  - `func newAuthHandler(userRepo repositories.UserRepository, next http.Handler) http.Handler` (unexported, in `clerk_middleware.go`)
  - `type stubUserRepo struct { ... }` implementing `repositories.UserRepository` (test-only, in `clerk_middleware_test.go`)

The `repositories.UserRepository` interface (`internal/core/ports/repositories/user_repository.go`) that `stubUserRepo` must satisfy in full:
```go
Create(ctx context.Context, user *domain.User) (*domain.User, error)
GetByID(ctx context.Context, id int) (*domain.User, error)
GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error)
GetByUsername(ctx context.Context, username string) (*domain.User, error)
GetByEmail(ctx context.Context, email string) (*domain.User, error)
ListAll(ctx context.Context) ([]*domain.User, error)
Update(ctx context.Context, user *domain.User) (*domain.User, error)
Delete(ctx context.Context, id int) error
CreateFromClerk(ctx context.Context, clerkID string, username string, email string) (*domain.User, error)
UpdateByClerkID(ctx context.Context, clerkID string, username string, email string) error
DeactivateByClerkID(ctx context.Context, clerkID string) error
```

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/auth/clerk_middleware_test.go`:

  ```go
  package auth

  import (
  	"context"
  	"encoding/json"
  	"errors"
  	"net/http"
  	"net/http/httptest"
  	"testing"

  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/clerk/clerk-sdk-go/v2"
  	"github.com/clerk/clerk-sdk-go/v2/clerktest"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  // stubUserRepo is a function-field test double for repositories.UserRepository.
  // Only the fields a given test sets are exercised; unset methods return
  // domain.ErrNotFound (or a zero value) so a test that accidentally hits an
  // unexpected method fails loudly rather than silently succeeding.
  type stubUserRepo struct {
  	createFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
  	getByIDFn             func(ctx context.Context, id int) (*domain.User, error)
  	getByClerkIDFn        func(ctx context.Context, clerkID string) (*domain.User, error)
  	getByUsernameFn       func(ctx context.Context, username string) (*domain.User, error)
  	getByEmailFn          func(ctx context.Context, email string) (*domain.User, error)
  	listAllFn             func(ctx context.Context) ([]*domain.User, error)
  	updateFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
  	deleteFn              func(ctx context.Context, id int) error
  	createFromClerkFn     func(ctx context.Context, clerkID, username, email string) (*domain.User, error)
  	updateByClerkIDFn     func(ctx context.Context, clerkID, username, email string) error
  	deactivateByClerkIDFn func(ctx context.Context, clerkID string) error
  }

  func (s *stubUserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
  	if s.createFn != nil {
  		return s.createFn(ctx, user)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
  	if s.getByIDFn != nil {
  		return s.getByIDFn(ctx, id)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
  	if s.getByClerkIDFn != nil {
  		return s.getByClerkIDFn(ctx, clerkID)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
  	if s.getByUsernameFn != nil {
  		return s.getByUsernameFn(ctx, username)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
  	if s.getByEmailFn != nil {
  		return s.getByEmailFn(ctx, email)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) ListAll(ctx context.Context) ([]*domain.User, error) {
  	if s.listAllFn != nil {
  		return s.listAllFn(ctx)
  	}
  	return nil, nil
  }
  func (s *stubUserRepo) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
  	if s.updateFn != nil {
  		return s.updateFn(ctx, user)
  	}
  	return nil, domain.ErrNotFound
  }
  func (s *stubUserRepo) Delete(ctx context.Context, id int) error {
  	if s.deleteFn != nil {
  		return s.deleteFn(ctx, id)
  	}
  	return domain.ErrNotFound
  }
  func (s *stubUserRepo) CreateFromClerk(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  	if s.createFromClerkFn != nil {
  		return s.createFromClerkFn(ctx, clerkID, username, email)
  	}
  	return nil, errors.New("CreateFromClerk not stubbed")
  }
  func (s *stubUserRepo) UpdateByClerkID(ctx context.Context, clerkID, username, email string) error {
  	if s.updateByClerkIDFn != nil {
  		return s.updateByClerkIDFn(ctx, clerkID, username, email)
  	}
  	return errors.New("UpdateByClerkID not stubbed")
  }
  func (s *stubUserRepo) DeactivateByClerkID(ctx context.Context, clerkID string) error {
  	if s.deactivateByClerkIDFn != nil {
  		return s.deactivateByClerkIDFn(ctx, clerkID)
  	}
  	return errors.New("DeactivateByClerkID not stubbed")
  }

  // setClerkAPIResponse points the package-level Clerk backend at a canned HTTP
  // response so clerkuser.Get can be driven without network access. The previous
  // backend is restored on test cleanup. Tests using this must not run in
  // parallel — clerk.SetBackend is process-global.
  func setClerkAPIResponse(t *testing.T, status int, body string) {
  	t.Helper()
  	previous := clerk.GetBackend()
  	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{
  		HTTPClient: &http.Client{Transport: &clerktest.RoundTripper{
  			T:      t,
  			Status: status,
  			Out:    json.RawMessage(body),
  		}},
  	}))
  	t.Cleanup(func() { clerk.SetBackend(previous) })
  }

  // runAuthHandler drives newAuthHandler with the given session subject (empty
  // string = no Clerk session at all) and returns whichever AuthenticatedUser the
  // handler injected into the downstream context, or nil.
  func runAuthHandler(t *testing.T, repo *stubUserRepo, subject string) (*domain.AuthenticatedUser, bool) {
  	t.Helper()

  	var seen *domain.AuthenticatedUser
  	var found bool
  	var nextCalled bool

  	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  		nextCalled = true
  		seen, found = ForContext(r.Context())
  		w.WriteHeader(http.StatusOK)
  	})

  	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
  	if subject != "" {
  		ctx := clerk.ContextWithSessionClaims(req.Context(), &clerk.SessionClaims{
  			RegisteredClaims: clerk.RegisteredClaims{Subject: subject},
  		})
  		req = req.WithContext(ctx)
  	}

  	rec := httptest.NewRecorder()
  	newAuthHandler(repo, next).ServeHTTP(rec, req)

  	require.True(t, nextCalled, "the middleware must always call next (it is permissive)")
  	assert.Equal(t, http.StatusOK, rec.Code)
  	return seen, found
  }

  func TestNewAuthHandler_NoSessionClaimsPassesThroughUnauthenticated(t *testing.T) {
  	user, ok := runAuthHandler(t, &stubUserRepo{}, "")
  	assert.False(t, ok)
  	assert.Nil(t, user)
  }

  func TestNewAuthHandler_ExistingLocalUserIsInjected(t *testing.T) {
  	repo := &stubUserRepo{
  		getByClerkIDFn: func(ctx context.Context, clerkID string) (*domain.User, error) {
  			assert.Equal(t, "user_abc", clerkID)
  			return &domain.User{
  				ID: 7, ClerkUserID: "user_abc", Username: "alice",
  				Email: "alice@example.com", Role: domain.UserRoleAdmin, Active: true,
  			}, nil
  		},
  	}

  	user, ok := runAuthHandler(t, repo, "user_abc")
  	require.True(t, ok)
  	require.NotNil(t, user)
  	assert.Equal(t, 7, user.ID)
  	assert.Equal(t, "user_abc", user.ClerkID)
  	assert.Equal(t, "alice", user.Username)
  	assert.Equal(t, "alice@example.com", user.Email)
  	assert.Equal(t, domain.UserRoleAdmin, user.Role)
  }

  func TestNewAuthHandler_NonNotFoundLookupErrorPassesThroughUnauthenticated(t *testing.T) {
  	repo := &stubUserRepo{
  		getByClerkIDFn: func(ctx context.Context, clerkID string) (*domain.User, error) {
  			return nil, errors.New("database unavailable")
  		},
  	}

  	user, ok := runAuthHandler(t, repo, "user_abc")
  	assert.False(t, ok)
  	assert.Nil(t, user)
  }

  func TestNewAuthHandler_OnDemandCreation(t *testing.T) {
  	notFound := func(ctx context.Context, clerkID string) (*domain.User, error) {
  		return nil, domain.ErrNotFound
  	}

  	t.Run("uses the Clerk username and primary email", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, `{
  			"id": "user_abc",
  			"username": "alice",
  			"primary_email_address_id": "idn_2",
  			"email_addresses": [
  				{"id": "idn_1", "email_address": "old@example.com"},
  				{"id": "idn_2", "email_address": "primary@example.com"}
  			]
  		}`)

  		var gotClerkID, gotUsername, gotEmail string
  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotClerkID, gotUsername, gotEmail = clerkID, username, email
  				return &domain.User{ID: 12, ClerkUserID: clerkID, Username: username, Email: email, Role: domain.UserRoleDefault, Active: true}, nil
  			},
  		}

  		user, ok := runAuthHandler(t, repo, "user_abc")
  		require.True(t, ok)
  		require.NotNil(t, user)
  		assert.Equal(t, "user_abc", gotClerkID)
  		assert.Equal(t, "alice", gotUsername)
  		assert.Equal(t, "primary@example.com", gotEmail, "the address matching primary_email_address_id must win")
  		assert.Equal(t, 12, user.ID)
  		assert.Equal(t, domain.UserRoleDefault, user.Role)
  	})

  	t.Run("falls back to the first email when no primary id is set", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, `{
  			"id": "user_abc",
  			"username": "alice",
  			"email_addresses": [{"id": "idn_1", "email_address": "first@example.com"}]
  		}`)

  		var gotEmail string
  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotEmail = email
  				return &domain.User{ID: 13, ClerkUserID: clerkID, Username: username, Email: email}, nil
  			},
  		}

  		_, ok := runAuthHandler(t, repo, "user_abc")
  		require.True(t, ok)
  		assert.Equal(t, "first@example.com", gotEmail)
  	})

  	t.Run("derives the username from the email prefix when Clerk has no username", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, `{
  			"id": "user_abc",
  			"username": null,
  			"primary_email_address_id": "idn_1",
  			"email_addresses": [{"id": "idn_1", "email_address": "bob@example.com"}]
  		}`)

  		var gotUsername string
  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotUsername = username
  				return &domain.User{ID: 14, ClerkUserID: clerkID, Username: username, Email: email}, nil
  			},
  		}

  		_, ok := runAuthHandler(t, repo, "user_abc")
  		require.True(t, ok)
  		assert.Equal(t, "bob", gotUsername)
  	})

  	t.Run("falls back to the Clerk user id when there is neither username nor email", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, `{"id": "user_abc", "username": null, "email_addresses": []}`)

  		var gotUsername, gotEmail string
  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotUsername, gotEmail = username, email
  				return &domain.User{ID: 15, ClerkUserID: clerkID, Username: username}, nil
  			},
  		}

  		_, ok := runAuthHandler(t, repo, "user_abc")
  		require.True(t, ok)
  		assert.Equal(t, "user_abc", gotUsername)
  		assert.Equal(t, "", gotEmail)
  	})

  	t.Run("passes through unauthenticated when the Clerk API lookup fails", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusNotFound, `{"errors":[{"message":"not found"}]}`)

  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				t.Fatal("CreateFromClerk must not be called when the Clerk API lookup fails")
  				return nil, nil
  			},
  		}

  		user, ok := runAuthHandler(t, repo, "user_abc")
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})

  	t.Run("passes through unauthenticated on a non-duplicate create failure", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, `{
  			"id": "user_abc", "username": "alice",
  			"primary_email_address_id": "idn_1",
  			"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
  		}`)

  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				return nil, errors.New("check constraint violated")
  			},
  		}

  		user, ok := runAuthHandler(t, repo, "user_abc")
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})
  }

  func TestNewAuthHandler_DuplicateEmailLinksClerkIDToExistingUser(t *testing.T) {
  	clerkProfile := `{
  		"id": "user_abc", "username": "alice",
  		"primary_email_address_id": "idn_1",
  		"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
  	}`
  	notFound := func(ctx context.Context, clerkID string) (*domain.User, error) { return nil, domain.ErrNotFound }

  	duplicateErrors := []struct {
  		name string
  		err  error
  	}{
  		{"unique_email constraint name", errors.New(`duplicate key value violates unique constraint "unique_email"`)},
  		{"raw 23505 sqlstate", errors.New("ERROR: duplicate key value (SQLSTATE 23505)")},
  	}

  	for _, de := range duplicateErrors {
  		t.Run("links on "+de.name, func(t *testing.T) {
  			setClerkAPIResponse(t, http.StatusOK, clerkProfile)

  			var updated *domain.User
  			repo := &stubUserRepo{
  				getByClerkIDFn: notFound,
  				createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  					return nil, de.err
  				},
  				getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
  					assert.Equal(t, "alice@example.com", email)
  					return &domain.User{ID: 3, Username: "alice", Email: email, Role: domain.UserRoleAdmin}, nil
  				},
  				updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
  					updated = user
  					return user, nil
  				},
  			}

  			user, ok := runAuthHandler(t, repo, "user_abc")
  			require.True(t, ok)
  			require.NotNil(t, user)
  			assert.Equal(t, 3, user.ID)
  			assert.Equal(t, "user_abc", user.ClerkID)
  			assert.Equal(t, domain.UserRoleAdmin, user.Role)
  			require.NotNil(t, updated)
  			assert.Equal(t, "user_abc", updated.ClerkUserID, "the existing row must have the Clerk id written onto it")
  		})
  	}

  	t.Run("passes through unauthenticated when the email lookup fails", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, clerkProfile)

  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				return nil, errors.New(`violates unique constraint "unique_email"`)
  			},
  			getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
  				return nil, errors.New("lookup failed")
  			},
  		}

  		user, ok := runAuthHandler(t, repo, "user_abc")
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})

  	t.Run("passes through unauthenticated when the link update fails", func(t *testing.T) {
  		setClerkAPIResponse(t, http.StatusOK, clerkProfile)

  		repo := &stubUserRepo{
  			getByClerkIDFn: notFound,
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				return nil, errors.New(`violates unique constraint "unique_email"`)
  			},
  			getByEmailFn: func(ctx context.Context, email string) (*domain.User, error) {
  				return &domain.User{ID: 3, Username: "alice", Email: email}, nil
  			},
  			updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
  				return nil, errors.New("update failed")
  			},
  		}

  		user, ok := runAuthHandler(t, repo, "user_abc")
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})
  }

  func TestMiddleware_UnauthenticatedRequestPassesThrough(t *testing.T) {
  	// Exercises the clerkhttp.WithHeaderAuthorization wiring in Middleware itself.
  	// With no Authorization header, Clerk's middleware adds no session claims, so
  	// our handler must fall through to next without touching the repository.
  	var nextCalled bool
  	var seen *domain.AuthenticatedUser
  	var found bool

  	handler := Middleware(&stubUserRepo{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  		nextCalled = true
  		seen, found = ForContext(r.Context())
  		w.WriteHeader(http.StatusOK)
  	}))

  	rec := httptest.NewRecorder()
  	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graphql", nil))

  	require.True(t, nextCalled)
  	assert.Equal(t, http.StatusOK, rec.Code)
  	assert.False(t, found)
  	assert.Nil(t, seen)
  }

  func TestMiddleware_UnparseableBearerTokenPassesThrough(t *testing.T) {
  	// jwt.Decode fails on a non-JWT bearer token; Clerk's middleware calls next
  	// without claims rather than rejecting, so the request stays anonymous.
  	var nextCalled bool
  	var found bool

  	handler := Middleware(&stubUserRepo{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  		nextCalled = true
  		_, found = ForContext(r.Context())
  		w.WriteHeader(http.StatusOK)
  	}))

  	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
  	req.Header.Set("Authorization", "Bearer not-a-jwt")

  	rec := httptest.NewRecorder()
  	handler.ServeHTTP(rec, req)

  	require.True(t, nextCalled)
  	assert.Equal(t, http.StatusOK, rec.Code)
  	assert.False(t, found)
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/auth/ -run 'TestNewAuthHandler|TestMiddleware'`
  Expected: FAIL to compile with `undefined: newAuthHandler` — the extraction in Step 3 has not happened yet.

- [ ] **Step 3: Write minimal implementation**

  Replace the whole of `Middleware` in `backend/internal/adapters/auth/clerk_middleware.go` (currently lines 18–146) with the following. This is a **pure extraction** — the body of the inner `http.HandlerFunc` moves verbatim into `newAuthHandler` and nothing else changes. Imports stay exactly as they are.

  ```go
  // Middleware verifies Clerk Bearer tokens and resolves local users.
  // Permissive: unauthenticated requests pass through for public queries.
  func Middleware(userRepo repositories.UserRepository) func(http.Handler) http.Handler {
  	return func(next http.Handler) http.Handler {
  		// Wrap with Clerk's JWT verification middleware
  		return clerkhttp.WithHeaderAuthorization()(newAuthHandler(userRepo, next))
  	}
  }

  // newAuthHandler resolves the Clerk session claims already present on the
  // request context into a local user and injects it as a domain.AuthenticatedUser.
  //
  // It is deliberately split out of Middleware so the user-resolution branches
  // (on-demand creation, email-based Clerk-ID linking, and every failure path)
  // can be driven directly in tests via clerk.ContextWithSessionClaims, without
  // needing a signed Clerk JWT and a live JWKS endpoint.
  //
  // Every failure path is permissive: it calls next unauthenticated rather than
  // rejecting the request, so public queries keep working.
  func newAuthHandler(userRepo repositories.UserRepository, next http.Handler) http.Handler {
  	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  		claims, ok := clerk.SessionClaimsFromContext(r.Context())
  		if !ok || claims == nil {
  			// No valid session — pass through as unauthenticated
  			next.ServeHTTP(w, r)
  			return
  		}

  		// Resolve Clerk user ID to local user
  		clerkUserID := claims.Subject
  		user, err := userRepo.GetByClerkID(r.Context(), clerkUserID)
  		if err != nil {
  			if errors.Is(err, domain.ErrNotFound) {
  				// On-demand creation: webhook may not have fired yet
  				clerkUsr, fetchErr := clerkuser.Get(r.Context(), clerkUserID)
  				if fetchErr != nil {
  					slog.Warn("clerk user not found via API",
  						"clerk_user_id", clerkUserID,
  						"error", fetchErr,
  					)
  					next.ServeHTTP(w, r)
  					return
  				}

  				// Extract username and email from Clerk profile
  				username := ""
  				if clerkUsr.Username != nil {
  					username = *clerkUsr.Username
  				}
  				email := ""
  				if len(clerkUsr.EmailAddresses) > 0 {
  					for _, ea := range clerkUsr.EmailAddresses {
  						if clerkUsr.PrimaryEmailAddressID != nil && ea.ID == *clerkUsr.PrimaryEmailAddressID {
  							email = ea.EmailAddress
  							break
  						}
  					}
  					if email == "" {
  						email = clerkUsr.EmailAddresses[0].EmailAddress
  					}
  				}
  				if username == "" {
  					// Fall back to email prefix
  					for i, c := range email {
  						if c == '@' {
  							username = email[:i]
  							break
  						}
  					}
  					if username == "" {
  						username = clerkUserID
  					}
  				}

  				localUser, createErr := userRepo.CreateFromClerk(r.Context(), clerkUserID, username, email)
  				if createErr != nil {
  					// Duplicate email: pre-existing user has this email but no clerk_user_id.
  					// Link the Clerk identity to the existing user.
  					if strings.Contains(createErr.Error(), "unique_email") || strings.Contains(createErr.Error(), "23505") {
  						existing, linkErr := userRepo.GetByEmail(r.Context(), email)
  						if linkErr == nil {
  							existing.ClerkUserID = clerkUserID
  							linked, updErr := userRepo.Update(r.Context(), existing)
  							if updErr == nil {
  								slog.Info("linked clerk ID to existing user by email",
  									"clerk_user_id", clerkUserID,
  									"local_user_id", existing.ID,
  								)
  								user = linked
  							} else {
  								slog.Error("failed to link clerk ID to existing user",
  									"clerk_user_id", clerkUserID,
  									"error", updErr,
  								)
  								next.ServeHTTP(w, r)
  								return
  							}
  						} else {
  							slog.Error("failed to find existing user by email for linking",
  								"clerk_user_id", clerkUserID,
  								"email", email,
  								"error", linkErr,
  							)
  							next.ServeHTTP(w, r)
  							return
  						}
  					} else {
  						slog.Error("failed to create user on-demand",
  							"clerk_user_id", clerkUserID,
  							"error", createErr,
  						)
  						next.ServeHTTP(w, r)
  						return
  					}
  				} else {
  					slog.Info("on-demand user creation",
  						"clerk_user_id", clerkUserID,
  						"local_user_id", localUser.ID,
  					)
  					user = localUser
  				}
  			} else {
  				slog.Error("failed to lookup user by clerk ID",
  					"clerk_user_id", clerkUserID,
  					"error", err,
  				)
  				next.ServeHTTP(w, r)
  				return
  			}
  		}

  		// Inject authenticated user into context
  		authUser := &domain.AuthenticatedUser{
  			ID:       user.ID,
  			ClerkID:  user.ClerkUserID,
  			Username: user.Username,
  			Email:    user.Email,
  			Role:     user.Role,
  		}
  		ctx := withUser(r.Context(), authUser)
  		next.ServeHTTP(w, r.WithContext(ctx))
  	})
  }
  ```

  Verify the extraction changed no behaviour: `git diff -w internal/adapters/auth/clerk_middleware.go` should show only the new function boundary and the one-line `Middleware` body — no edits inside the moved block.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/auth/ -run 'TestNewAuthHandler|TestMiddleware' -cover`
  Expected: PASS, all subtests.
  Then confirm nothing downstream broke: `go build ./...`

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/auth/clerk_middleware.go backend/internal/adapters/auth/clerk_middleware_test.go
  git commit -m "test: cover Clerk middleware user resolution via extracted newAuthHandler"
  ```

---

### Task 9: Clerk webhook handler and auth context tests

**Subagent type:** `go-backend`

**Files:**
- Create: `backend/internal/adapters/auth/webhook_handler_test.go`
- Create: `backend/internal/adapters/auth/context_test.go`

**Interfaces:**
- Consumes (**soft dependency on Task 8**): `type stubUserRepo` is declared in Task 8's `clerk_middleware_test.go`, same package. **Do not redeclare it.** If Task 8 has not been merged when this task runs, declare a distinctly named double (`webhookUserRepo`) with the same function-field shape instead, and leave a `// TODO: collapse into stubUserRepo once Task 8 lands` comment. Both tasks can otherwise run in parallel.
- Produces: nothing other tasks rely on.

Types/methods under test:
- `backend/internal/adapters/auth/webhook_handler.go`: `WebhookHandler{WebhookSecret string; UserRepo repositories.UserRepository}` with `ServeHTTP(w http.ResponseWriter, r *http.Request)`; unexported `(*clerkUserData).primaryEmail() string` and `(*clerkUserData).username() string`.
- `backend/internal/adapters/auth/context.go`: `ForContext`, `RequireAuth`, `withUser`, `WithAuthenticatedUser`.

Signature verification uses the svix library's own signer: `svixwebhook.NewWebhook(secret)` then `wh.Sign(msgID string, ts time.Time, payload []byte) (string, error)`, with headers `svix-id`, `svix-timestamp` (Unix seconds as a decimal string), `svix-signature`. `NewWebhook` strips a `whsec_` prefix and base64-decodes the remainder, so the test secret must be `whsec_` + valid standard base64. Timestamps must be within 5 minutes of now.

- [ ] **Step 1: Write the failing test**

  Create `backend/internal/adapters/auth/context_test.go`:

  ```go
  package auth

  import (
  	"context"
  	"testing"

  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  )

  func TestForContext(t *testing.T) {
  	t.Run("bare context has no authenticated user", func(t *testing.T) {
  		user, ok := ForContext(context.Background())
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})

  	t.Run("nil user stored under the key is treated as unauthenticated", func(t *testing.T) {
  		ctx := withUser(context.Background(), nil)
  		user, ok := ForContext(ctx)
  		assert.False(t, ok)
  		assert.Nil(t, user)
  	})

  	t.Run("round-trips a stored user", func(t *testing.T) {
  		want := &domain.AuthenticatedUser{ID: 7, ClerkID: "user_abc", Username: "alice", Email: "alice@example.com", Role: domain.UserRoleAdmin}
  		user, ok := ForContext(withUser(context.Background(), want))
  		require.True(t, ok)
  		assert.Equal(t, want, user)
  	})

  	t.Run("WithAuthenticatedUser uses the same key as withUser", func(t *testing.T) {
  		want := &domain.AuthenticatedUser{ID: 9, Username: "bob", Role: domain.UserRoleDefault}
  		user, ok := ForContext(WithAuthenticatedUser(context.Background(), want))
  		require.True(t, ok)
  		assert.Equal(t, want, user)
  	})
  }

  func TestRequireAuth(t *testing.T) {
  	t.Run("returns an access-denied error when unauthenticated", func(t *testing.T) {
  		user, err := RequireAuth(context.Background())
  		assert.Nil(t, user)
  		require.Error(t, err)
  		assert.Equal(t, "access denied: authentication required", err.Error())
  	})

  	t.Run("returns the stored user when authenticated", func(t *testing.T) {
  		want := &domain.AuthenticatedUser{ID: 7, Username: "alice", Role: domain.UserRoleAdmin}
  		user, err := RequireAuth(WithAuthenticatedUser(context.Background(), want))
  		require.NoError(t, err)
  		assert.Equal(t, want, user)
  	})
  }
  ```

  Create `backend/internal/adapters/auth/webhook_handler_test.go`:

  ```go
  package auth

  import (
  	"context"
  	"errors"
  	"net/http"
  	"net/http/httptest"
  	"strconv"
  	"strings"
  	"testing"
  	"time"

  	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
  	"github.com/stretchr/testify/assert"
  	"github.com/stretchr/testify/require"
  	svixwebhook "github.com/svix/svix-webhooks/go"
  )

  // testWebhookSecret is generated fresh per run: "whsec_" + standard base64 of
  // 24 random bytes, the shape svixwebhook.NewWebhook expects. Generated rather
  // than hard-coded so no secret-shaped literal lives in the repo.
  var testWebhookSecret = newTestWebhookSecret()

  func newTestWebhookSecret() string {
  	b := make([]byte, 24)
  	if _, err := rand.Read(b); err != nil {
  		panic("generate test webhook secret: " + err.Error())
  	}
  	return "whsec_" + base64.StdEncoding.EncodeToString(b)
  }

  // signedWebhookRequest builds a POST carrying `body` with genuinely valid svix
  // signature headers for testWebhookSecret.
  func signedWebhookRequest(t *testing.T, body string) *http.Request {
  	t.Helper()

  	wh, err := svixwebhook.NewWebhook(testWebhookSecret)
  	require.NoError(t, err)

  	msgID := "msg_test_1"
  	ts := time.Now()
  	sig, err := wh.Sign(msgID, ts, []byte(body))
  	require.NoError(t, err)

  	req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
  	req.Header.Set("svix-id", msgID)
  	req.Header.Set("svix-timestamp", strconv.FormatInt(ts.Unix(), 10))
  	req.Header.Set("svix-signature", sig)
  	return req
  }

  func serveWebhook(t *testing.T, repo *stubUserRepo, secret string, req *http.Request) *httptest.ResponseRecorder {
  	t.Helper()
  	rec := httptest.NewRecorder()
  	(&WebhookHandler{WebhookSecret: secret, UserRepo: repo}).ServeHTTP(rec, req)
  	return rec
  }

  // --- clerkUserData helpers ---

  func TestClerkUserData_PrimaryEmail(t *testing.T) {
  	t.Run("prefers the address matching primary_email_address_id", func(t *testing.T) {
  		d := &clerkUserData{PrimaryEmailAddressID: "idn_2"}
  		d.EmailAddresses = append(d.EmailAddresses, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_1", EmailAddress: "first@example.com"}, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_2", EmailAddress: "primary@example.com"})

  		assert.Equal(t, "primary@example.com", d.primaryEmail())
  	})

  	t.Run("falls back to the first address when the primary id does not match", func(t *testing.T) {
  		d := &clerkUserData{PrimaryEmailAddressID: "idn_missing"}
  		d.EmailAddresses = append(d.EmailAddresses, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_1", EmailAddress: "first@example.com"})

  		assert.Equal(t, "first@example.com", d.primaryEmail())
  	})

  	t.Run("returns empty string when there are no addresses", func(t *testing.T) {
  		assert.Equal(t, "", (&clerkUserData{}).primaryEmail())
  	})
  }

  func TestClerkUserData_Username(t *testing.T) {
  	name := "alice"
  	empty := ""

  	t.Run("uses the explicit username when present", func(t *testing.T) {
  		assert.Equal(t, "alice", (&clerkUserData{ID: "user_abc", Username: &name}).username())
  	})

  	t.Run("empty username string falls through to the email prefix", func(t *testing.T) {
  		d := &clerkUserData{ID: "user_abc", Username: &empty, PrimaryEmailAddressID: "idn_1"}
  		d.EmailAddresses = append(d.EmailAddresses, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_1", EmailAddress: "bob@example.com"})

  		assert.Equal(t, "bob", d.username())
  	})

  	t.Run("nil username falls through to the email prefix", func(t *testing.T) {
  		d := &clerkUserData{ID: "user_abc", PrimaryEmailAddressID: "idn_1"}
  		d.EmailAddresses = append(d.EmailAddresses, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_1", EmailAddress: "carol@example.com"})

  		assert.Equal(t, "carol", d.username())
  	})

  	t.Run("an email with no @ falls back to the Clerk id", func(t *testing.T) {
  		d := &clerkUserData{ID: "user_abc", PrimaryEmailAddressID: "idn_1"}
  		d.EmailAddresses = append(d.EmailAddresses, struct {
  			ID           string `json:"id"`
  			EmailAddress string `json:"email_address"`
  		}{ID: "idn_1", EmailAddress: "no-at-sign"})

  		assert.Equal(t, "user_abc", d.username())
  	})

  	t.Run("no username and no email falls back to the Clerk id", func(t *testing.T) {
  		assert.Equal(t, "user_abc", (&clerkUserData{ID: "user_abc"}).username())
  	})
  }

  // --- signature and payload handling ---

  func TestWebhookHandler_RejectsBadSignatures(t *testing.T) {
  	body := `{"type":"user.created","data":{"id":"user_abc"}}`

  	t.Run("missing svix headers yield 401", func(t *testing.T) {
  		req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
  		assert.Equal(t, http.StatusUnauthorized, rec.Code)
  		assert.Contains(t, rec.Body.String(), "invalid signature")
  	})

  	t.Run("tampered signature yields 401", func(t *testing.T) {
  		req := signedWebhookRequest(t, body)
  		req.Header.Set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
  		assert.Equal(t, http.StatusUnauthorized, rec.Code)
  	})

  	t.Run("body tampered after signing yields 401", func(t *testing.T) {
  		req := signedWebhookRequest(t, body)
  		req.Body = http.NoBody
  		req = httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(`{"type":"user.deleted","data":{"id":"evil"}}`))
  		req.Header.Set("svix-id", "msg_test_1")
  		req.Header.Set("svix-timestamp", strconv.FormatInt(time.Now().Unix(), 10))
  		req.Header.Set("svix-signature", "v1,AAAA")
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
  		assert.Equal(t, http.StatusUnauthorized, rec.Code)
  	})

  	t.Run("stale timestamp outside the 5 minute tolerance yields 401", func(t *testing.T) {
  		wh, err := svixwebhook.NewWebhook(testWebhookSecret)
  		require.NoError(t, err)
  		stale := time.Now().Add(-10 * time.Minute)
  		sig, err := wh.Sign("msg_stale", stale, []byte(body))
  		require.NoError(t, err)

  		req := httptest.NewRequest(http.MethodPost, "/webhooks/clerk", strings.NewReader(body))
  		req.Header.Set("svix-id", "msg_stale")
  		req.Header.Set("svix-timestamp", strconv.FormatInt(stale.Unix(), 10))
  		req.Header.Set("svix-signature", sig)

  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, req)
  		assert.Equal(t, http.StatusUnauthorized, rec.Code)
  	})
  }

  func TestWebhookHandler_EmptySecretYields500(t *testing.T) {
  	req := signedWebhookRequest(t, `{"type":"user.created","data":{"id":"user_abc"}}`)
  	rec := serveWebhook(t, &stubUserRepo{}, "", req)
  	assert.Equal(t, http.StatusInternalServerError, rec.Code)
  	assert.Contains(t, rec.Body.String(), "invalid webhook configuration")
  }

  func TestWebhookHandler_MalformedPayloadsYield400(t *testing.T) {
  	t.Run("body is not valid JSON", func(t *testing.T) {
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `not json`))
  		assert.Equal(t, http.StatusBadRequest, rec.Code)
  		assert.Contains(t, rec.Body.String(), "invalid payload")
  	})

  	t.Run("data field is absent", func(t *testing.T) {
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `{"type":"user.created"}`))
  		assert.Equal(t, http.StatusBadRequest, rec.Code)
  		assert.Contains(t, rec.Body.String(), "invalid user data")
  	})

  	t.Run("data field is not an object", func(t *testing.T) {
  		rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, `{"type":"user.created","data":"nope"}`))
  		assert.Equal(t, http.StatusBadRequest, rec.Code)
  		assert.Contains(t, rec.Body.String(), "invalid user data")
  	})
  }

  // --- event dispatch ---

  const createdEventBody = `{
  	"type": "user.created",
  	"data": {
  		"id": "user_abc",
  		"username": "alice",
  		"primary_email_address_id": "idn_1",
  		"email_addresses": [{"id": "idn_1", "email_address": "alice@example.com"}]
  	}
  }`

  func TestWebhookHandler_UserCreated(t *testing.T) {
  	t.Run("creates the local user and returns 200 with an ok body", func(t *testing.T) {
  		var gotID, gotUsername, gotEmail string
  		repo := &stubUserRepo{
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotID, gotUsername, gotEmail = clerkID, username, email
  				return &domain.User{ID: 1, ClerkUserID: clerkID, Username: username, Email: email}, nil
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, createdEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code)
  		assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
  		assert.Equal(t, "user_abc", gotID)
  		assert.Equal(t, "alice", gotUsername)
  		assert.Equal(t, "alice@example.com", gotEmail)
  	})

  	t.Run("derives the username from the email prefix when Clerk sends none", func(t *testing.T) {
  		body := `{
  			"type": "user.created",
  			"data": {
  				"id": "user_abc",
  				"username": null,
  				"primary_email_address_id": "idn_1",
  				"email_addresses": [{"id": "idn_1", "email_address": "bob@example.com"}]
  			}
  		}`
  		var gotUsername string
  		repo := &stubUserRepo{
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				gotUsername = username
  				return &domain.User{ID: 1}, nil
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, body))
  		assert.Equal(t, http.StatusOK, rec.Code)
  		assert.Equal(t, "bob", gotUsername)
  	})

  	t.Run("repository failure yields 500", func(t *testing.T) {
  		repo := &stubUserRepo{
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				return nil, errors.New("insert failed")
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, createdEventBody))
  		assert.Equal(t, http.StatusInternalServerError, rec.Code)
  		assert.Contains(t, rec.Body.String(), "failed to create user")
  	})
  }

  const updatedEventBody = `{
  	"type": "user.updated",
  	"data": {
  		"id": "user_abc",
  		"username": "alice2",
  		"primary_email_address_id": "idn_1",
  		"email_addresses": [{"id": "idn_1", "email_address": "alice2@example.com"}]
  	}
  }`

  func TestWebhookHandler_UserUpdated(t *testing.T) {
  	t.Run("updates the local user and returns 200", func(t *testing.T) {
  		var gotID, gotUsername, gotEmail string
  		repo := &stubUserRepo{
  			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
  				gotID, gotUsername, gotEmail = clerkID, username, email
  				return nil
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code)
  		assert.Equal(t, "user_abc", gotID)
  		assert.Equal(t, "alice2", gotUsername)
  		assert.Equal(t, "alice2@example.com", gotEmail)
  	})

  	t.Run("ErrNotFound falls back to creating the user and still returns 200", func(t *testing.T) {
  		createCalled := false
  		repo := &stubUserRepo{
  			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
  				return domain.ErrNotFound
  			},
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				createCalled = true
  				assert.Equal(t, "user_abc", clerkID)
  				assert.Equal(t, "alice2", username)
  				return &domain.User{ID: 1}, nil
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code)
  		assert.True(t, createCalled, "a missing user must be created on user.updated")
  	})

  	t.Run("ErrNotFound with a failing fallback create still returns 200", func(t *testing.T) {
  		repo := &stubUserRepo{
  			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
  				return domain.ErrNotFound
  			},
  			createFromClerkFn: func(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
  				return nil, errors.New("create failed")
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code, "the fallback create failure is logged, not surfaced")
  	})

  	t.Run("a non-ErrNotFound failure yields 500", func(t *testing.T) {
  		repo := &stubUserRepo{
  			updateByClerkIDFn: func(ctx context.Context, clerkID, username, email string) error {
  				return errors.New("update failed")
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, updatedEventBody))
  		assert.Equal(t, http.StatusInternalServerError, rec.Code)
  		assert.Contains(t, rec.Body.String(), "failed to update user")
  	})
  }

  const deletedEventBody = `{"type":"user.deleted","data":{"id":"user_abc"}}`

  func TestWebhookHandler_UserDeleted(t *testing.T) {
  	t.Run("deactivates the local user and returns 200", func(t *testing.T) {
  		var gotID string
  		repo := &stubUserRepo{
  			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
  				gotID = clerkID
  				return nil
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code)
  		assert.Equal(t, "user_abc", gotID)
  	})

  	t.Run("ErrNotFound is tolerated and returns 200", func(t *testing.T) {
  		repo := &stubUserRepo{
  			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
  				return domain.ErrNotFound
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
  		assert.Equal(t, http.StatusOK, rec.Code)
  	})

  	t.Run("any other failure yields 500", func(t *testing.T) {
  		repo := &stubUserRepo{
  			deactivateByClerkIDFn: func(ctx context.Context, clerkID string) error {
  				return errors.New("deactivate failed")
  			},
  		}

  		rec := serveWebhook(t, repo, testWebhookSecret, signedWebhookRequest(t, deletedEventBody))
  		assert.Equal(t, http.StatusInternalServerError, rec.Code)
  		assert.Contains(t, rec.Body.String(), "failed to deactivate user")
  	})
  }

  func TestWebhookHandler_UnknownEventTypeIsIgnored(t *testing.T) {
  	body := `{"type":"session.created","data":{"id":"sess_1"}}`
  	// No repository functions are stubbed: any repo call would return the
  	// "not stubbed" error and change the status code, so a 200 proves the
  	// handler ignored the event entirely.
  	rec := serveWebhook(t, &stubUserRepo{}, testWebhookSecret, signedWebhookRequest(t, body))
  	assert.Equal(t, http.StatusOK, rec.Code)
  	assert.JSONEq(t, `{"status":"ok"}`, rec.Body.String())
  }
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run (from `backend/`): `go test ./internal/adapters/auth/ -run 'TestForContext|TestRequireAuth|TestClerkUserData|TestWebhookHandler'`
  Expected: before the files exist, no matching test output. If Task 8 has not landed, the run fails to compile with `undefined: stubUserRepo` — apply the fallback in "Consumes" above.

- [ ] **Step 3: Write minimal implementation**
  None. No production code changes.

  **Note on the anonymous struct literals:** `clerkUserData.EmailAddresses` is an anonymous-struct slice, so the literals in `TestClerkUserData_*` must repeat the field tags exactly as written above. If that proves unwieldy, an equivalent and cleaner alternative is to build the value by `json.Unmarshal`-ing a JSON fixture into a `clerkUserData` and then calling `primaryEmail()`/`username()` — do that instead if the literals fight you, but keep every assertion.

- [ ] **Step 4: Run test to verify it passes**
  Run: `go test ./internal/adapters/auth/ -cover`
  Expected: PASS. The reported package coverage should be ≥80%.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/internal/adapters/auth/webhook_handler_test.go backend/internal/adapters/auth/context_test.go
  git commit -m "test: cover Clerk webhook handler event dispatch and auth context helpers"
  ```

---

### Task 10: Final verification — coverage targets, build, and full suite

**Subagent type:** `go-backend`

**Files:**
- Modify: none (verification only). If a check fails, fix the *test* that caused it and amend/add a commit; do not weaken assertions to make a number go up.

**Interfaces:**
- Consumes: **all** of Tasks 1–9 must be committed first. This is the only strictly-last task.
- Produces: nothing.

- [ ] **Step 1: Verify the build is clean**
  Run (from `backend/`): `go build ./...`
  Expected: no output, exit 0.

  Run: `gofmt -l .`
  Expected: no output.

  Run: `go vet ./internal/adapters/repositories/postgres/ ./internal/adapters/auth/`
  Expected: no output.

- [ ] **Step 2: Run the full test suite**
  Run: `go test ./... > /tmp/be_test.out 2>&1`
  Then: `echo $?`
  Expected: `0`. If non-zero, run `cat /tmp/be_test.out` and fix the failure before proceeding. Pay particular attention to `backend/test/...` packages — the Task 8 refactor touched production code, so `test/resolvers` and `test/services` must still pass unchanged.

- [ ] **Step 3: Verify the coverage targets**
  Run: `./scripts/coverage-by-package.sh`

  Assert, reading the printed table:
  - The `internal/adapters/repositories/postgres` line shows **≥ 70.0%** (was `0.0% (0/523)`).
  - The `internal/adapters/auth` line shows **≥ 80.0%** (was `5.7% (8/141)`).
  - The `TOTAL` line has risen from its `22.76%` baseline. Record the new value in the commit message. **Do not gate on the TOTAL number** — it is informational.
  - No previously-covered package has *dropped*. Compare against the pre-change baseline if one was captured; a drop would indicate a test was accidentally deleted or skipped.

  If either target is missed:
  1. Run `go tool cover -func=<profile>` on a profile for the short package to find the specific uncovered functions — or re-run `go test -coverprofile=/tmp/pkg.out ./internal/adapters/...` for just that package and inspect it.
  2. Add the missing cases to the relevant task's test file. The most likely gaps are: (a) `GormContentRepository.List` filter branches whose sqlmock regex was relaxed during Task 6 troubleshooting and no longer forces the branch, and (b) the on-demand-creation error branches in `newAuthHandler` if any Task 8 subtest was dropped.
  3. Never add assertion-free tests or `t.Skip()` to move the number.

- [ ] **Step 4: Verify the new dependency is test-only**
  Run: `grep -rn "go-sqlmock" internal/ pkg/ cmd/ --include=*.go | grep -v _test.go`
  Expected: no output — `go-sqlmock` must appear only in `_test.go` files.

  Run: `grep -n "DATA-DOG/go-sqlmock" go.mod`
  Expected: exactly one line in the `require` block.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/go.mod backend/go.sum
  git commit --allow-empty -m "test: verify postgres and auth adapter coverage targets

  internal/adapters/repositories/postgres: 0.0% -> <actual>% (target 70%)
  internal/adapters/auth: 5.7% -> <actual>% (target 80%)
  TOTAL: 22.76% -> <actual>%

  Adds go-sqlmock as a test-only dependency; no production imports."
  ```
  Replace each `<actual>` with the real figure from Step 3 before committing.

---

## Self-Review Notes (performed before finalising)

- **Spec coverage.** Every file in both target packages is addressed: `array_types.go` (T1), `helpers.go` (T2), `gorm_mappers.go` + `gorm_models.go` (T3), `gorm_user_repository.go` (T5), `gorm_content_repository.go` + `gorm_category_repository.go` (T6), `gorm_perspective_repository.go` (T7), `clerk_middleware.go` (T8), `webhook_handler.go` + `context.go` (T9). The `*.sqlx.bak` files in the postgres directory are **not** compiled by Go (no `.go` extension) and therefore contribute nothing to the 523-statement denominator — correctly excluded.
- **Placeholder scan.** No `TODO`, no "write tests for X", no `...` stand-ins in any test body. Every expected value was derived by reading the source (e.g. the `buildContentSortRules` default branch really does hard-code `paginator.DESC` on the primary rule while the tie-breaker follows the caller's order — asserted explicitly in T2).
- **Signature consistency across tasks.** `newMockDB` / `assertAllExpectationsMet` are produced once in T4 and consumed with identical signatures in T5, T6, T7. `stubUserRepo` is produced once in T8 and consumed in T9, with an explicit fallback if merge order inverts. Pointer helpers are deliberately given three non-colliding names across T3 (`strPtr`/`intPtr`), T6 (`cStr`/`cInt`) and T7 (`pStr`/`pInt`) — an earlier draft reused `strPtr` in all three, which would not have compiled since all files share `package postgres`. Fixed inline.
- **Fixed dependency risk.** T4's harness originally omitted `DisableAutomaticPing`; `gorm.Open` pings its `ConnPool` at open time, which sqlmock rejects unless `MonitorPingsOption` is set. Added, along with `SkipDefaultTransaction` (otherwise every write test needs `ExpectBegin`/`ExpectCommit`) and a silent logger. Documented as load-bearing in the harness comment.
- **Parallelism.** Tasks 1, 2, 3, 4, 8, 9 have no inter-dependencies. Tasks 5, 6, 7 depend only on T4 and are independent of each other. Task 10 depends on all. No dependency was invented that the code does not actually require.
- **Known production bug, deliberately not fixed here.** `webhook_handler.go:126` and `:142` compare with `err == domain.ErrNotFound` rather than `errors.Is`. The current GORM repository returns the bare sentinel so behaviour is correct today, but any future `%w`-wrapping in `UpdateByClerkID`/`DeactivateByClerkID` would silently turn a 200 into a 500. The tests above pin today's behaviour with the bare sentinel; changing production error handling is out of scope for a coverage plan and should be raised separately.