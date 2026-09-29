package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
)

// Config represents the application configuration
type Config struct {
	Server   ServerConfig   `json:"server"`
	Database DatabaseConfig `json:"database"`
	YouTube  YouTubeConfig  `json:"youtube"`
	Logging  LoggingConfig  `json:"logging"`

	// MessageRetentionMax caps how many of the newest messages each thread
	// keeps. 0 (the default) disables the application-side retention sweep
	// entirely — threads grow unbounded. Set via MESSAGE_RETENTION_MAX.
	MessageRetentionMax int `json:"message_retention_max"`

	// MessageRetentionSweepMinutes is how often the retention sweep runs when
	// enabled. Defaults to 15. Set via MESSAGE_RETENTION_SWEEP_MINUTES.
	MessageRetentionSweepMinutes int `json:"message_retention_sweep_minutes"`

	// Assistant configures the in-app assistant (Jeeves). Off unless
	// JEEVES_ENABLED=true. The API key is read by the provider SDK directly
	// from ANTHROPIC_API_KEY and never stored here.
	Assistant AssistantConfig `json:"assistant"`
}

// AssistantConfig holds in-app assistant settings.
type AssistantConfig struct {
	Enabled bool   `json:"enabled"` // JEEVES_ENABLED
	Model   string `json:"model"`   // ASSISTANT_MODEL
}

// DefaultAssistantModel is used when ASSISTANT_MODEL is unset.
const DefaultAssistantModel = "claude-opus-5"

// DefaultMessageRetentionSweepMinutes is the sweep cadence when retention is
// enabled but MESSAGE_RETENTION_SWEEP_MINUTES is unset or invalid.
const DefaultMessageRetentionSweepMinutes = 15

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Port int    `json:"port"`
	Host string `json:"host"`
}

// DatabaseConfig holds database connection configuration
type DatabaseConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Name     string `json:"name"`
	User     string `json:"user"`
	Password string `json:"password,omitempty"` // Will be overridden by env var
	SSLMode  string `json:"sslmode"`
}

// YouTubeConfig holds YouTube API configuration
type YouTubeConfig struct {
	APIKey string `json:"api_key"` // Will be overridden by env var

	// CacheTTLSeconds controls how long a fetched video's metadata is kept in
	// the in-memory YouTube response cache before it's re-fetched from the
	// API. Default is 6 hours — see YOUTUBE_API_CACHE_TTL_SECONDS in .env.example.
	CacheTTLSeconds int `json:"cache_ttl_seconds"`
}

// DefaultYouTubeCacheTTLSeconds is 6 hours, expressed in seconds.
const DefaultYouTubeCacheTTLSeconds = 6 * 60 * 60

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level  string `json:"level"`
	Format string `json:"format"`
}

// Load reads configuration from file and environment variables.
// If the config file is missing, returns sensible defaults (production uses env vars).
func Load(configPath string) (*Config, error) {
	cfg := Config{
		Server:  ServerConfig{Port: 8080, Host: ""},
		YouTube: YouTubeConfig{CacheTTLSeconds: DefaultYouTubeCacheTTLSeconds},
	}

	// Read config file (optional in production where env vars provide all config)
	file, err := os.Open(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file — use defaults + env vars
		} else {
			return nil, fmt.Errorf("failed to open config file: %w", err)
		}
	} else {
		defer file.Close()
		decoder := json.NewDecoder(file)
		if err := decoder.Decode(&cfg); err != nil {
			return nil, fmt.Errorf("failed to parse config file: %w", err)
		}
	}

	// Override with environment variables (for secrets)
	if dbPassword := os.Getenv("DATABASE_PASSWORD"); dbPassword != "" {
		cfg.Database.Password = dbPassword
	}

	if ytAPIKey := os.Getenv("YOUTUBE_API_KEY"); ytAPIKey != "" {
		cfg.YouTube.APIKey = ytAPIKey
	}

	// Unlike getEnvInt (security.go), 0 is a valid value here — it disables
	// the YouTube response cache entirely — so parse directly rather than
	// treating 0 as "unset". An unset or invalid value falls back to
	// whatever's already in cfg.YouTube.CacheTTLSeconds (config file value,
	// or DefaultYouTubeCacheTTLSeconds set above).
	if ttlStr := os.Getenv("YOUTUBE_API_CACHE_TTL_SECONDS"); ttlStr != "" {
		if v, err := strconv.Atoi(ttlStr); err == nil && v >= 0 {
			cfg.YouTube.CacheTTLSeconds = v
		}
	}

	// Message retention: 0 / unset / invalid => unbounded (no application-side
	// sweep). Only a positive value enables pruning.
	if v := os.Getenv("MESSAGE_RETENTION_MAX"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.MessageRetentionMax = n
		}
	}
	cfg.MessageRetentionSweepMinutes = DefaultMessageRetentionSweepMinutes
	if v := os.Getenv("MESSAGE_RETENTION_SWEEP_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.MessageRetentionSweepMinutes = n
		}
	}

	if v := os.Getenv("JEEVES_ENABLED"); v != "" {
		cfg.Assistant.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("ASSISTANT_MODEL"); v != "" {
		cfg.Assistant.Model = v
	}
	if cfg.Assistant.Model == "" {
		cfg.Assistant.Model = DefaultAssistantModel
	}

	return &cfg, nil
}

// GetAddr returns the server address in host:port format
func (c *ServerConfig) GetAddr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// GetDSN returns the PostgreSQL connection string (Data Source Name)
// Prefers DATABASE_URL env var if set (for hosted databases like Sevalla)
func (c *DatabaseConfig) GetDSN() string {
	if url := os.Getenv("DATABASE_URL"); url != "" {
		return url
	}
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host, c.Port, c.User, c.Password, c.Name, c.SSLMode)
}
