package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestLoad_MessageRetentionMax_ZeroIsIgnored verifies that an env value of 0 is
// not "positive" and therefore does not override the config-file value.
func TestLoad_MessageRetentionMax_ZeroIsIgnored(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want int
	}{
		{"zero keeps file value", "0", 200},
		{"negative keeps file value", "-1", 200},
		{"one overrides file value", "1", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearConfigEnvVars(t)
			path := filepath.Join(t.TempDir(), "config.json")
			require.NoError(t, os.WriteFile(path, []byte(`{"message_retention_max": 200}`), 0o600))
			t.Setenv("MESSAGE_RETENTION_MAX", tt.env)

			cfg, err := config.Load(path)
			require.NoError(t, err)
			assert.Equal(t, tt.want, cfg.MessageRetentionMax)
		})
	}
}

// TestLoad_MessageRetentionSweepMinutes_Boundary verifies only a positive
// interval overrides the default; 0 must not produce a zero-minute sweep.
func TestLoad_MessageRetentionSweepMinutes_Boundary(t *testing.T) {
	tests := []struct {
		name string
		env  string
		want int
	}{
		{"zero falls back to default", "0", config.DefaultMessageRetentionSweepMinutes},
		{"negative falls back to default", "-1", config.DefaultMessageRetentionSweepMinutes},
		{"one overrides default", "1", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearConfigEnvVars(t)
			t.Setenv("MESSAGE_RETENTION_SWEEP_MINUTES", tt.env)

			cfg, err := config.Load(filepath.Join(t.TempDir(), "missing.json"))
			require.NoError(t, err)
			assert.Equal(t, tt.want, cfg.MessageRetentionSweepMinutes)
		})
	}
}
