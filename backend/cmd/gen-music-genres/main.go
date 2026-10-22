// Command gen-music-genres writes migration 000033 (music_genres seed) from the
// compact Apple snapshot, applying ADR 0006 Option C. Run from backend/:
//
//	go run ./cmd/gen-music-genres
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	in := flag.String("in", "data/music-genres/apple-genres-34.compact.json", "compact Apple genre snapshot")
	out := flag.String("out", "migrations/000033_add_music_genres", "migration path prefix; .up.sql and .down.sql are added")
	flag.Parse()
	if err := run(*in, *out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(in, out string) error {
	raw, err := os.ReadFile(in)
	if err != nil {
		return err
	}
	var roots []node
	if err := json.Unmarshal(raw, &roots); err != nil {
		return fmt.Errorf("parse %s: %w", in, err)
	}
	rows, err := Reshape(roots)
	if err != nil {
		return err
	}
	if err := os.WriteFile(out+".up.sql", []byte(RenderUp(rows)), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(out+".down.sql", []byte(downSQL), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %d genres to %s.up.sql\n", len(rows), out)
	return nil
}
