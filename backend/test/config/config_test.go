package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/config"
	"github.com/stretchr/testify/assert"
)

// clearConfigEnvVars ensures config-relevant env vars are empty so tests
// run against config file values only. t.Setenv restores originals on cleanup.
func clearConfigEnvVars(t *testing.T) {
	t.Helper()
	for _, key := range []string{"DATABASE_URL", "DATABASE_PASSWORD", "YOUTUBE_API_KEY", "YOUTUBE_API_CACHE_TTL_SECONDS", "MESSAGE_RETENTION_MAX", "MESSAGE_RETENTION_SWEEP_MINUTES", "JEEVES_ENABLED", "ASSISTANT_MODEL"} {
		t.Setenv(key, "")
	}
}

// TestLoad_RealConfigFile tests loading the actual config.example.json
func TestLoad_RealConfigFile(t *testing.T) {
	clearConfigEnvVars(t)

	// Load the ACTUAL config file from the project
	configPath := "../../config/config.example.json"

	cfg, err := config.Load(configPath)
	assert.NoError(t, err, "Should load real config.example.json without errors")
	assert.NotNil(t, cfg)

	// Verify the actual structure and values in config.example.json
	assert.Equal(t, 8080, cfg.Server.Port, "Server port should match config.example.json")
	assert.Equal(t, "localhost", cfg.Server.Host)
	assert.Equal(t, "localhost", cfg.Database.Host)
	assert.Equal(t, 5432, cfg.Database.Port)
	assert.Equal(t, "testdb", cfg.Database.Name)
	assert.Equal(t, "testuser", cfg.Database.User)
	assert.Equal(t, "disable", cfg.Database.SSLMode)
	assert.Equal(t, "", cfg.YouTube.APIKey, "API key should be empty in example config")
	assert.Equal(t, config.DefaultYouTubeCacheTTLSeconds, cfg.YouTube.CacheTTLSeconds, "cache TTL should default to 6 hours when not set in config file")
	assert.Equal(t, "info", cfg.Logging.Level)
	assert.Equal(t, "json", cfg.Logging.Format)
}

// TestLoad_YouTubeCacheTTL_EnvOverride verifies the env var overrides the default.
func TestLoad_YouTubeCacheTTL_EnvOverride(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("YOUTUBE_API_CACHE_TTL_SECONDS", "60")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, 60, cfg.YouTube.CacheTTLSeconds)
}

// TestLoad_YouTubeCacheTTL_ZeroDisablesCache verifies 0 is honored (not
// treated as "unset") so operators can turn caching off entirely.
func TestLoad_YouTubeCacheTTL_ZeroDisablesCache(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("YOUTUBE_API_CACHE_TTL_SECONDS", "0")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, 0, cfg.YouTube.CacheTTLSeconds)
}

// TestLoad_YouTubeCacheTTL_InvalidFallsBackToDefault verifies a garbage
// value doesn't silently zero out the TTL or crash config loading.
func TestLoad_YouTubeCacheTTL_InvalidFallsBackToDefault(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("YOUTUBE_API_CACHE_TTL_SECONDS", "not-a-number")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, config.DefaultYouTubeCacheTTLSeconds, cfg.YouTube.CacheTTLSeconds)
}

// TestLoad_MessageRetention verifies the retention env vars are parsed onto Config.
func TestLoad_MessageRetention(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("MESSAGE_RETENTION_MAX", "500")
	t.Setenv("MESSAGE_RETENTION_SWEEP_MINUTES", "30")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, 500, cfg.MessageRetentionMax)
	assert.Equal(t, 30, cfg.MessageRetentionSweepMinutes)
}

// TestLoad_MessageRetention_DefaultsUnbounded verifies retention is off by
// default (max 0 => no sweep) and the sweep interval defaults to 15 minutes.
func TestLoad_MessageRetention_DefaultsUnbounded(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("MESSAGE_RETENTION_MAX", "")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, 0, cfg.MessageRetentionMax, "retention unbounded by default")
	assert.Equal(t, 15, cfg.MessageRetentionSweepMinutes, "sweep interval defaults to 15 minutes")
}

// TestLoad_MessageRetention_InvalidIgnored verifies a garbage value leaves
// retention unbounded rather than crashing config load.
func TestLoad_MessageRetention_InvalidIgnored(t *testing.T) {
	clearConfigEnvVars(t)
	t.Setenv("MESSAGE_RETENTION_MAX", "not-a-number")
	t.Setenv("MESSAGE_RETENTION_SWEEP_MINUTES", "-5")

	cfg, err := config.Load("../../config/config.example.json")
	assert.NoError(t, err)
	assert.Equal(t, 0, cfg.MessageRetentionMax)
	assert.Equal(t, 15, cfg.MessageRetentionSweepMinutes)
}

// TestLoad_RealConfigWithEnvOverrides tests that env vars override the real config
func TestLoad_RealConfigWithEnvOverrides(t *testing.T) {
	clearConfigEnvVars(t)

	configPath := "../../config/config.example.json"

	// Set environment variables (t.Setenv auto-restores on cleanup)
	t.Setenv("DATABASE_PASSWORD", "secret123")
	t.Setenv("YOUTUBE_API_KEY", "yt_key_456")

	cfg, err := config.Load(configPath)
	assert.NoError(t, err)
	assert.NotNil(t, cfg)

	// Verify environment variables override empty values from config.example.json
	assert.Equal(t, "secret123", cfg.Database.Password, "DATABASE_PASSWORD env var should override config")
	assert.Equal(t, "yt_key_456", cfg.YouTube.APIKey, "YOUTUBE_API_KEY env var should override config")
}

// TestLoad_MissingFile returns defaults when config file is missing (production uses env vars)
func TestLoad_MissingFile(t *testing.T) {
	cfg, err := config.Load("/nonexistent/path/config.json")
	assert.NoError(t, err)
	assert.NotNil(t, cfg)
	assert.Equal(t, 8080, cfg.Server.Port)
}

// TestLoad_InvalidJSON tests error handling for malformed JSON
// Note: This uses a temp file since we don't want to commit invalid JSON to the repo
func TestLoad_InvalidJSON(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "invalid.json")

	invalidJSON := `{ "server": { "port": invalid } }`
	err := os.WriteFile(configPath, []byte(invalidJSON), 0644)
	assert.NoError(t, err)

	cfg, err := config.Load(configPath)
	assert.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "failed to parse config file")
}

// TestServerConfig_GetAddr tests the server address helper
func TestServerConfig_GetAddr(t *testing.T) {
	cfg := &config.ServerConfig{
		Host: "0.0.0.0",
		Port: 3000,
	}

	addr := cfg.GetAddr()
	assert.Equal(t, "0.0.0.0:3000", addr)
}

// TestDatabaseConfig_GetDSN tests the database connection string generation
func TestDatabaseConfig_GetDSN(t *testing.T) {
	clearConfigEnvVars(t)

	cfg := &config.DatabaseConfig{
		Host:     "db.example.com",
		Port:     5432,
		User:     "myuser",
		Password: "mypassword",
		Name:     "mydb",
		SSLMode:  "require",
	}

	dsn := cfg.GetDSN()
	expected := "host=db.example.com port=5432 user=myuser password=mypassword dbname=mydb sslmode=require"
	assert.Equal(t, expected, dsn)
}

// TestDatabaseConfig_GetDSN_FromRealConfig tests DSN generation with actual config values
func TestDatabaseConfig_GetDSN_FromRealConfig(t *testing.T) {
	clearConfigEnvVars(t)

	configPath := "../../config/config.example.json"

	// Set password via env var (like production)
	t.Setenv("DATABASE_PASSWORD", "testpass")

	cfg, err := config.Load(configPath)
	assert.NoError(t, err)

	dsn := cfg.Database.GetDSN()

	// Verify DSN contains values from real config
	assert.Contains(t, dsn, "host=localhost")
	assert.Contains(t, dsn, "port=5432")
	assert.Contains(t, dsn, "user=testuser")
	assert.Contains(t, dsn, "password=testpass")
	assert.Contains(t, dsn, "dbname=testdb")
	assert.Contains(t, dsn, "sslmode=disable")

	// Verify it's a valid PostgreSQL connection string format
	expected := "host=localhost port=5432 user=testuser password=testpass dbname=testdb sslmode=disable"
	assert.Equal(t, expected, dsn)
}

func TestLoad_Assistant(t *testing.T) {
	clearConfigEnvVars(t)

	cfg, err := config.Load("nonexistent.json")
	assert.NoError(t, err)
	assert.False(t, cfg.Assistant.Enabled, "assistant is off by default")
	assert.Equal(t, config.DefaultAssistantModel, cfg.Assistant.Model)

	t.Setenv("JEEVES_ENABLED", "true")
	t.Setenv("ASSISTANT_MODEL", "claude-sonnet-5")
	cfg, err = config.Load("nonexistent.json")
	assert.NoError(t, err)
	assert.True(t, cfg.Assistant.Enabled)
	assert.Equal(t, "claude-sonnet-5", cfg.Assistant.Model)

	t.Setenv("JEEVES_ENABLED", "yes-please")
	cfg, err = config.Load("nonexistent.json")
	assert.NoError(t, err)
	assert.False(t, cfg.Assistant.Enabled, "only true/1 enable it")
}
