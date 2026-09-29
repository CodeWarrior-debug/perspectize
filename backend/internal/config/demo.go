package config

import (
	"fmt"
	"os"
	"strings"
)

// Demo holds demo-mode configuration. Demo mode swaps Clerk-only auth for
// seeded demo personas ("Bearer demo.<persona>") and the live YouTube API for
// offline fixtures, so a local/Docker stack can run guided tours, record
// videos and exercise auth-gated flows end to end with no external accounts.
type Demo struct {
	Enabled bool
}

// LoadDemo reads DEMO_MODE. It returns an error — callers must treat it as
// fatal — when demo mode is requested with APP_ENV=production: demo tokens are
// unsigned, so enabling them there would let anyone act as a seeded user.
func LoadDemo() (Demo, error) {
	return loadDemo(os.Getenv("DEMO_MODE"), os.Getenv("APP_ENV"))
}

func loadDemo(demoMode, appEnv string) (Demo, error) {
	enabled := isTruthy(demoMode)
	if enabled && strings.EqualFold(strings.TrimSpace(appEnv), "production") {
		return Demo{}, fmt.Errorf("DEMO_MODE cannot be enabled when APP_ENV=production")
	}
	return Demo{Enabled: enabled}, nil
}

func isTruthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
