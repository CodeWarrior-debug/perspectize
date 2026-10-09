package tmdb

import (
	"os"
	"testing"
)

// BenchmarkShapeMovie measures parsing a real TMDB movie payload and
// re-marshaling the shaped subset that gets stored on the content row.
func BenchmarkShapeMovie(b *testing.B) {
	raw, err := os.ReadFile("testdata/movie_603.json")
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := ShapeMovie(raw); err != nil {
			b.Fatal(err)
		}
	}
}
