package config

import "testing"

func TestLoadDemo(t *testing.T) {
	tests := []struct {
		name, demoMode, appEnv string
		want, wantErr          bool
	}{
		{"unset", "", "", false, false},
		{"false", "false", "development", false, false},
		{"true in dev", "true", "development", true, false},
		{"1 with no env", "1", "", true, false},
		{"true in production is refused", "true", "production", false, true},
		{"production spelled loosely is refused", "yes", " Production ", false, true},
		{"off in production is fine", "false", "production", false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := loadDemo(tt.demoMode, tt.appEnv)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if got.Enabled != tt.want {
				t.Fatalf("Enabled = %v, want %v", got.Enabled, tt.want)
			}
		})
	}
}
