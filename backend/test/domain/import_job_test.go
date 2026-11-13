package domain_test

import (
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestImportSourceType_DestinationType(t *testing.T) {
	assert.Equal(t, domain.ContentTypeYouTubeVideo, domain.ImportSourceYouTubeChannel.DestinationType())
	assert.Equal(t, domain.ContentTypeMovie, domain.ImportSourceTMDBPerson.DestinationType())
	assert.True(t, domain.ImportSourceTMDBPerson.Valid())
	assert.False(t, domain.ImportSourceType("RSS").Valid())
}

// gtyPromo is the block Grace to You appends to every video (from the real channel survey).
const gtyPromo = "To receive Grace to You's monthly letter, as well as offers for resources by mail, click here: https://www.gty.org/home/newtogty\n\n" +
	"Follow us on:\nFacebook: https://www.facebook.com/gracetoyou\nX: https://x.com/gracetoyou\n\nCopyright © 2026, Grace to You. All rights reserved."

func TestSummarizeDescriptions(t *testing.T) {
	t.Run("skips a promo block repeated across the source and keeps the first real line", func(t *testing.T) {
		descs := []string{
			"For details about this sermon, click here: https://www.gty.org/sermons/81-123\n\n" + gtyPromo,
			"Casey Diaz was jumped into a Los Angeles gang at 11.\n\n" + gtyPromo,
			gtyPromo,
			"Watch the full sermon at: https://www.gty.org/sermons/90-1\n" + gtyPromo,
		}
		got := domain.SummarizeDescriptions(descs)
		assert.Equal(t, "", got[0], "only a link line and the promo")
		assert.Equal(t, "Casey Diaz was jumped into a Los Angeles gang at 11.", got[1])
		assert.Equal(t, "", got[2])
		assert.Equal(t, "", got[3])
	})

	t.Run("a line repeated in more than half the descriptions is boilerplate even without links", func(t *testing.T) {
		sign := "Thanks for watching and supporting the channel every week."
		descs := []string{"First real summary line here.\n" + sign, sign + "\nSecond real summary line.", sign}
		got := domain.SummarizeDescriptions(descs)
		assert.Equal(t, []string{"First real summary line here.", "Second real summary line.", ""}, got)
	})

	t.Run("with fewer than three descriptions nothing counts as repeated", func(t *testing.T) {
		same := "The same opening sentence in both."
		got := domain.SummarizeDescriptions([]string{same, same})
		assert.Equal(t, []string{same, same}, got)
	})

	t.Run("skips short labels and chapter lines, and truncates long lines", func(t *testing.T) {
		long := strings.Repeat("word ", 60)
		got := domain.SummarizeDescriptions([]string{"Chapters:\n0:00 Intro\n" + long})
		assert.True(t, strings.HasSuffix(got[0], "…"))
		assert.LessOrEqual(t, len([]rune(got[0])), 200)
	})

	t.Run("empty input", func(t *testing.T) {
		assert.Empty(t, domain.SummarizeDescriptions(nil))
	})
}

func TestParseChapters(t *testing.T) {
	tests := []struct {
		name string
		desc string
		want []domain.ImportChapter
	}{
		{
			name: "timestamps first, with separators and hours",
			desc: "Intro text\n0:00 Intro\n2:15 - Order and chaos\n1:02:03 | Q&A",
			want: []domain.ImportChapter{ch(0, "Intro"), ch(135, "Order and chaos"), ch(3723, "Q&A")},
		},
		{
			name: "timestamps last, in parentheses",
			desc: "Intro (0:00)\nThe dragon (1:30)\nThe hoard (4:00)",
			want: []domain.ImportChapter{ch(0, "Intro"), ch(90, "The dragon"), ch(240, "The hoard")},
		},
		{name: "fewer than three", desc: "0:00 Intro\n1:00 End"},
		{name: "first is not 0:00", desc: "0:05 Intro\n1:00 Two\n2:00 Three"},
		{name: "a chapter shorter than 10 seconds", desc: "0:00 A\n0:05 B\n1:00 C"},
		{name: "not ascending", desc: "0:00 A\n2:00 B\n1:00 C"},
		{name: "invalid seconds", desc: "0:00 A\n1:75 B\n3:00 C"},
		{name: "no timestamps", desc: "Just a description."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, domain.ParseChapters(tt.desc))
		})
	}
}

func ch(start int, title string) domain.ImportChapter {
	return domain.ImportChapter{StartSeconds: start, Title: title}
}

func TestLinkDomains(t *testing.T) {
	desc := "Sermon: https://www.gty.org/sermons/81-1 and https://gty.org/x\n" +
		"Video: https://www.youtube.com/watch?v=abc https://youtu.be/abc https://m.youtube.com/x\n" +
		"Social: https://x.com/gracetoyou, (https://www.facebook.com/gracetoyou)"
	assert.Equal(t, []string{"facebook.com", "gty.org", "x.com"}, domain.LinkDomains(desc))
	assert.Empty(t, domain.LinkDomains("no links"))
}
