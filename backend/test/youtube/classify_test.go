package youtube_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClassifyURL(t *testing.T) {
	const id = "dQw4w9WgXcQ"
	tests := []struct {
		name   string
		url    string
		kind   youtube.URLKind
		wantID string
		err    bool
	}{
		{"music watch", "https://music.youtube.com/watch?v=" + id, youtube.URLKindMusicTrack, id, false},
		{"music watch with playlist keeps v", "https://music.youtube.com/watch?v=" + id + "&list=RDAMVM" + id, youtube.URLKindMusicTrack, id, false},
		{"music watch with v not first", "https://music.youtube.com/watch?feature=share&v=" + id, youtube.URLKindMusicTrack, id, false},
		{"music playlist", "https://music.youtube.com/playlist?list=OLAK5uy_abc", youtube.URLKindMusicCollection, "", false},
		{"music album browse", "https://music.youtube.com/browse/MPREb_abc", youtube.URLKindMusicCollection, "", false},
		{"music artist channel", "https://music.youtube.com/channel/UCabc", youtube.URLKindMusicCollection, "", false},
		{"regular watch", "https://www.youtube.com/watch?v=" + id, youtube.URLKindVideo, id, false},
		{"short link", "https://youtu.be/" + id, youtube.URLKindVideo, id, false},
		{"shorts", "https://www.youtube.com/shorts/" + id, youtube.URLKindVideo, id, false},
		{"not youtube", "https://example.com/watch?v=" + id, "", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kind, gotID, err := youtube.ClassifyURL(tt.url)
			if tt.err {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.kind, kind)
			assert.Equal(t, tt.wantID, gotID)
		})
	}
}

func TestNormalizeYouTubeMusicURL(t *testing.T) {
	assert.Equal(t, "https://music.youtube.com/watch?v=dQw4w9WgXcQ", youtube.NormalizeYouTubeMusicURL("dQw4w9WgXcQ"))
	assert.NotEqual(t, youtube.NormalizeYouTubeURL("dQw4w9WgXcQ"), youtube.NormalizeYouTubeMusicURL("dQw4w9WgXcQ"))
}
