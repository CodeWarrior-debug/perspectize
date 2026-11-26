package resolvers

import "testing"

// An empty YouTube statistic is missing, not zero: the client must not show a
// count the source never reported.
func TestParseStatCountEmptyIsMissing(t *testing.T) {
	if got := parseStatCount("", "viewCount", 1); got != nil {
		t.Fatalf("empty count = %d, want nil (missing)", *got)
	}
}

func TestParseStatCountNumber(t *testing.T) {
	got := parseStatCount("1234", "viewCount", 1)
	if got == nil || *got != 1234 {
		t.Fatalf("count = %v, want 1234", got)
	}
}
