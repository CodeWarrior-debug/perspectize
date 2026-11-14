package config

import (
	"log"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

// Security holds authentication, rate limiting, and CORS configuration.
type Security struct {
	ClerkSecretKey  string
	RateLimitPerMin int      // Default 100
	CORSOrigins     []string // Explicit origins
}

// LoadSecurity reads security configuration from environment variables.
// In production, CLERK_SECRET_KEY must be set.
func LoadSecurity() Security {
	clerkKey := os.Getenv("CLERK_SECRET_KEY")
	if os.Getenv("APP_ENV") == "production" && clerkKey == "" {
		log.Fatal("CLERK_SECRET_KEY is required in production")
	} else if clerkKey == "" {
		slog.Warn("CLERK_SECRET_KEY not set — Clerk auth will not work")
	}

	return Security{
		ClerkSecretKey:  clerkKey,
		RateLimitPerMin: getEnvInt("RATE_LIMIT_PER_MIN", 100),
		CORSOrigins:     getEnvStringSlice("CORS_ORIGINS", []string{"*"}),
	}
}

// getEnvInt reads an integer from an environment variable with a default.
func getEnvInt(key string, defaultValue int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	v, err := strconv.Atoi(val)
	if err != nil || v <= 0 {
		return defaultValue
	}
	return v
}

// getEnvStringSlice reads a comma-separated string list from an environment variable.
func getEnvStringSlice(key string, defaultValue []string) []string {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	return strings.Split(val, ",")
}
