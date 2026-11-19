package config_test

import (
	"strconv"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	"github.com/stretchr/testify/assert"
)

// clearImportLimitEnv empties both import-limit variables so a test starts from
// "unset" whatever the developer's shell exports. t.Setenv restores originals on
// cleanup; getEnvInt treats an empty value as unset.
func clearImportLimitEnv(t *testing.T) {
	t.Helper()
	t.Setenv("IMPORT_ROW_CONCURRENCY", "")
	t.Setenv("IMPORT_LISTING_CONCURRENCY", "")
}

func TestLoadImportLimits_DefaultsWhenUnset(t *testing.T) {
	clearImportLimitEnv(t)

	got := config.LoadImportLimits()

	assert.Equal(t, config.DefaultImportRowConcurrency, got.RowConcurrency)
	assert.Equal(t, config.DefaultImportListingConcurrency, got.ListingConcurrency)
}

// Override values below are derived from the defaults (default + 1), so a later
// change to a default cannot make an override equal its default and hide a bug.
func TestLoadImportLimits_EnvOverrides(t *testing.T) {
	rows := config.DefaultImportRowConcurrency + 1
	listings := config.DefaultImportListingConcurrency + 1
	clearImportLimitEnv(t)
	t.Setenv("IMPORT_ROW_CONCURRENCY", strconv.Itoa(rows))
	t.Setenv("IMPORT_LISTING_CONCURRENCY", strconv.Itoa(listings))

	got := config.LoadImportLimits()

	assert.Equal(t, rows, got.RowConcurrency)
	assert.Equal(t, listings, got.ListingConcurrency)
}

// TestLoadImportLimits_EachVariableIsIndependent proves overriding one cap does
// not disturb the other (the two are read from separate variables).
func TestLoadImportLimits_EachVariableIsIndependent(t *testing.T) {
	t.Run("only rows set", func(t *testing.T) {
		rows := config.DefaultImportRowConcurrency + 1
		clearImportLimitEnv(t)
		t.Setenv("IMPORT_ROW_CONCURRENCY", strconv.Itoa(rows))

		got := config.LoadImportLimits()

		assert.Equal(t, rows, got.RowConcurrency)
		assert.Equal(t, config.DefaultImportListingConcurrency, got.ListingConcurrency)
	})
	t.Run("only listings set", func(t *testing.T) {
		listings := config.DefaultImportListingConcurrency + 1
		clearImportLimitEnv(t)
		t.Setenv("IMPORT_LISTING_CONCURRENCY", strconv.Itoa(listings))

		got := config.LoadImportLimits()

		assert.Equal(t, config.DefaultImportRowConcurrency, got.RowConcurrency)
		assert.Equal(t, listings, got.ListingConcurrency)
	})
}

// TestImportDefaults_StayInsideTheCodeDefaultPoolReserve pins a ceiling: at the
// code-default database pool, the two shipped defaults together must not trigger
// ImportPoolWarning, so they may not exceed the pool-reserve rule. With the row
// default at 4 that leaves room for at most 8 listings (2 x (4 + 8) = 24 is below
// the pool of 25; 9 would warn). It does not say the defaults must sit at the
// ceiling. Raising either default past it fails here, so the register's open
// decision on the rule (.docs/CAPACITY_REGISTER.md) is made on purpose, not by
// accident.
func TestImportDefaults_StayInsideTheCodeDefaultPoolReserve(t *testing.T) {
	defaults := config.ImportLimits{
		RowConcurrency:     config.DefaultImportRowConcurrency,
		ListingConcurrency: config.DefaultImportListingConcurrency,
	}
	pool := database.DefaultPoolConfig().MaxOpenConns

	msg, warn := config.ImportPoolWarning(defaults, pool)

	assert.False(t, warn, "defaults (rows %d, listings %d) must not warn at the code-default pool of %d: %s",
		defaults.RowConcurrency, defaults.ListingConcurrency, pool, msg)
}

// TestLoadImportLimits_InvalidFallsBackToDefault covers zero, negative, garbage
// and empty values: none may disable a cap (a zero-capacity limiter would
// block every import forever) or crash startup.
func TestLoadImportLimits_InvalidFallsBackToDefault(t *testing.T) {
	for _, raw := range []string{"0", "-3", "abc", ""} {
		t.Run("rows="+strconv.Quote(raw), func(t *testing.T) {
			clearImportLimitEnv(t)
			t.Setenv("IMPORT_ROW_CONCURRENCY", raw)

			got := config.LoadImportLimits()

			assert.Equal(t, config.DefaultImportRowConcurrency, got.RowConcurrency)
		})
		t.Run("listings="+strconv.Quote(raw), func(t *testing.T) {
			clearImportLimitEnv(t)
			t.Setenv("IMPORT_LISTING_CONCURRENCY", raw)

			got := config.LoadImportLimits()

			assert.Equal(t, config.DefaultImportListingConcurrency, got.ListingConcurrency)
		})
	}
}

func TestImportPoolWarning_Boundary(t *testing.T) {
	// The (4, 2) limits below are arbitrary table inputs for the rule's arithmetic,
	// not the shipped defaults, so changing a default never changes this table.
	tests := []struct {
		name     string
		limits   config.ImportLimits
		poolMax  int
		wantWarn bool
	}{
		{"caps well above half the pool warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, 10, true},
		{"caps exactly half the pool warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, 12, true},
		{"one connection above half does not warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, 13, false},
		{"roomy pool does not warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, 25, false},
		{"unknown pool size (zero) does not warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, 0, false},
		{"unknown pool size (negative) does not warn", config.ImportLimits{RowConcurrency: 4, ListingConcurrency: 2}, -5, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg, warn := config.ImportPoolWarning(tt.limits, tt.poolMax)

			assert.Equal(t, tt.wantWarn, warn)
			if tt.wantWarn {
				assert.NotEmpty(t, msg)
			} else {
				assert.Empty(t, msg)
			}
		})
	}
}

// TestImportPoolWarning_MessageNamesTheNumbers uses values that appear nowhere
// else in the message text so a substring match proves each number is reported.
func TestImportPoolWarning_MessageNamesTheNumbers(t *testing.T) {
	limits := config.ImportLimits{RowConcurrency: 11, ListingConcurrency: 13}

	msg, warn := config.ImportPoolWarning(limits, 48) // 2*(11+13) == 48: exactly half

	assert.True(t, warn)
	assert.Contains(t, msg, "11", "row cap")
	assert.Contains(t, msg, "13", "listing cap")
	assert.Contains(t, msg, "48", "pool size")
	assert.Contains(t, msg, "could take half of the database pool", "exactly half warns, so it says imports could take half")
	assert.Contains(t, msg, "or more", "half or more")
	assert.Contains(t, msg, "more than half of the pool should stay free", "the reserve is more than half, not at least half")
	assert.NotContains(t, msg, "too high", "exactly half is not 'too high'")
	assert.Contains(t, msg, "user requests")
	for _, name := range []string{"IMPORT_ROW_CONCURRENCY", "IMPORT_LISTING_CONCURRENCY", "DB_MAX_OPEN_CONNS"} {
		assert.Contains(t, msg, name, "names the setting to change")
	}
}
