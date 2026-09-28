package main

import "testing"

func TestCheckHost(t *testing.T) {
	tests := []struct {
		dsn         string
		allowRemote bool
		wantErr     bool
	}{
		{"postgres://u:p@localhost:5432/db?sslmode=disable", false, false},
		{"postgres://u:p@postgres:5432/db", false, false},
		{"postgres://u@127.0.0.1/db", false, false},
		{"host=localhost user=u dbname=db", false, false},
		{"postgres://u:p@us-east1-001.proxy.sevalla.app:5432/db", false, true},
		{"host=db.example.com user=u", false, true},
		{"postgres://u:p@us-east1-001.proxy.sevalla.app:5432/db", true, false},
	}
	for _, tt := range tests {
		if err := checkHost(tt.dsn, tt.allowRemote); (err != nil) != tt.wantErr {
			t.Errorf("checkHost(%q, %v) err = %v, wantErr %v", tt.dsn, tt.allowRemote, err, tt.wantErr)
		}
	}
}
