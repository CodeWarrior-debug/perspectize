package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// maxChannelItems stops listing a channel past this many candidates.
const maxChannelItems = 5000

// importBatchSize is what both list endpoints allow per page, and what
// videos.list accepts per call (1 quota unit each).
const importBatchSize = 50

// errPlaylistMissing marks a channel playlist that doesn't exist (a channel
// with no Shorts or no livestreams); listing skips it.
var errPlaylistMissing = errors.New("playlist not found")

var (
	channelIDRe = regexp.MustCompile(`^UC[A-Za-z0-9_-]{22}$`)
	handleRe    = regexp.MustCompile(`^@?[A-Za-z0-9._-]{3,30}$`)
)

// channelPlaylists are the channel's per-kind upload lists: the channel id's
// "UC" prefix is swapped for these. They are undocumented but long stable;
// plain "UU" is every upload, all kinds mixed.
var channelPlaylists = []struct {
	prefix string
	kind   domain.ImportItemKind
}{
	{"UULF", domain.ImportItemKindVideo},
	{"UUSH", domain.ImportItemKindShort},
	{"UULV", domain.ImportItemKindLive},
}

// ChannelLister lists a YouTube channel's uploads as import candidates. Cost:
// 1 unit to resolve, then 2 units per 50 videos (playlistItems + videos).
type ChannelLister struct {
	c   *Client
	now func() time.Time
}

var _ services.ImportSourceLister = (*ChannelLister)(nil)

// NewChannelLister builds a lister on the client's key, HTTP client and base URL.
func NewChannelLister(c *Client) *ChannelLister {
	return &ChannelLister{c: c, now: time.Now}
}

// Resolve accepts a UC… channel id, an @handle, or a youtube.com /channel/ or /@ URL.
func (l *ChannelLister) Resolve(ctx context.Context, ref string) (*services.ResolvedImportSource, error) {
	q := url.Values{"part": {"snippet"}}
	ref = strings.TrimSpace(ref)
	switch id, handle := parseChannelRef(ref); {
	case id != "":
		q.Set("id", id)
	case handle != "":
		q.Set("forHandle", handle)
	default:
		return nil, fmt.Errorf("%w: not a YouTube channel id, handle or URL", domain.ErrInvalidInput)
	}

	var res struct {
		Items []struct {
			ID      string `json:"id"`
			Snippet struct {
				Title     string `json:"title"`
				CustomURL string `json:"customUrl"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := l.get(ctx, "/channels", q, &res); err != nil {
		return nil, err
	}
	if len(res.Items) == 0 {
		return nil, fmt.Errorf("%w: no YouTube channel for %q", domain.ErrNotFound, ref)
	}
	ch := res.Items[0]
	link := "https://www.youtube.com/channel/" + ch.ID
	if ch.Snippet.CustomURL != "" {
		link = "https://www.youtube.com/" + ch.Snippet.CustomURL
	}
	return &services.ResolvedImportSource{ID: ch.ID, Title: ch.Snippet.Title, URL: link}, nil
}

// parseChannelRef returns a channel id or a handle (with "@") from what was entered.
func parseChannelRef(ref string) (id, handle string) {
	if u, err := url.Parse(ref); err == nil && u.Host != "" {
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		switch {
		case len(parts) >= 2 && parts[0] == "channel":
			ref = parts[1]
		case len(parts) >= 1 && strings.HasPrefix(parts[0], "@"):
			ref = parts[0]
		default:
			return "", ""
		}
	}
	if channelIDRe.MatchString(ref) {
		return ref, ""
	}
	if handleRe.MatchString(ref) {
		return "", "@" + strings.TrimPrefix(ref, "@")
	}
	return "", ""
}

// List walks the long-form, Shorts and live playlists in that order, enriching
// each page of ids with one videos.list call before emitting it.
func (l *ChannelLister) List(ctx context.Context, source services.ResolvedImportSource, _ *domain.ImportPersonRole, emit services.ImportBatchFunc) error {
	if !channelIDRe.MatchString(source.ID) {
		return fmt.Errorf("%w: not a channel id", domain.ErrInvalidInput)
	}
	seen := make(map[string]bool)
	position := 0
	for _, pl := range channelPlaylists {
		playlistID := pl.prefix + strings.TrimPrefix(source.ID, "UC")
		pageToken := ""
		for {
			if position >= maxChannelItems {
				return nil
			}
			ids, next, err := l.playlistPage(ctx, playlistID, pageToken)
			if errors.Is(err, errPlaylistMissing) {
				break
			}
			if err != nil {
				return err
			}
			fresh := ids[:0]
			for _, id := range ids {
				if !seen[id] {
					seen[id] = true
					fresh = append(fresh, id)
				}
			}
			if len(fresh) > 0 {
				batch, err := l.videos(ctx, fresh, pl.kind, position)
				if err != nil {
					return err
				}
				position += len(fresh)
				if err := emit(batch); err != nil {
					return err
				}
			}
			if next == "" {
				break
			}
			pageToken = next
		}
	}
	return nil
}

// playlistPage returns one page of video ids from a playlist.
func (l *ChannelLister) playlistPage(ctx context.Context, playlistID, pageToken string) ([]string, string, error) {
	q := url.Values{
		"part":       {"contentDetails"},
		"playlistId": {playlistID},
		"maxResults": {strconv.Itoa(importBatchSize)},
	}
	if pageToken != "" {
		q.Set("pageToken", pageToken)
	}
	var res struct {
		NextPageToken string `json:"nextPageToken"`
		Items         []struct {
			ContentDetails struct {
				VideoID string `json:"videoId"`
			} `json:"contentDetails"`
		} `json:"items"`
	}
	if err := l.get(ctx, "/playlistItems", q, &res); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, "", errPlaylistMissing
		}
		return nil, "", err
	}
	ids := make([]string, 0, len(res.Items))
	for _, it := range res.Items {
		if it.ContentDetails.VideoID != "" {
			ids = append(ids, it.ContentDetails.VideoID)
		}
	}
	return ids, res.NextPageToken, nil
}

// channelVideo is the slice of videos.list the decision row needs.
type channelVideo struct {
	ID      string `json:"id"`
	Snippet struct {
		Title                string   `json:"title"`
		Description          string   `json:"description"`
		ChannelTitle         string   `json:"channelTitle"`
		PublishedAt          string   `json:"publishedAt"`
		Tags                 []string `json:"tags"`
		CategoryID           string   `json:"categoryId"`
		DefaultAudioLanguage string   `json:"defaultAudioLanguage"`
		Thumbnails           map[string]struct {
			URL string `json:"url"`
		} `json:"thumbnails"`
	} `json:"snippet"`
	ContentDetails struct {
		Duration string `json:"duration"`
		Caption  string `json:"caption"`
	} `json:"contentDetails"`
	Statistics struct {
		ViewCount    *string `json:"viewCount"`
		LikeCount    *string `json:"likeCount"`
		CommentCount *string `json:"commentCount"`
	} `json:"statistics"`
}

// videos enriches up to 50 ids with one videos.list call, in the order given.
// Private and deleted videos are absent from the response and so are dropped.
func (l *ChannelLister) videos(ctx context.Context, ids []string, kind domain.ImportItemKind, firstPosition int) ([]*domain.ImportItemWithDetails, error) {
	q := url.Values{
		"part":       {"snippet,statistics,contentDetails"},
		"id":         {strings.Join(ids, ",")},
		"maxResults": {strconv.Itoa(importBatchSize)},
	}
	var res struct {
		Items []channelVideo `json:"items"`
	}
	if err := l.get(ctx, "/videos", q, &res); err != nil {
		return nil, err
	}
	byID := make(map[string]channelVideo, len(res.Items))
	for _, v := range res.Items {
		byID[v.ID] = v
	}

	fetched := l.now().UTC()
	descs := make([]string, 0, len(ids))
	ordered := make([]channelVideo, 0, len(ids))
	positions := make([]int, 0, len(ids))
	for i, id := range ids {
		if v, ok := byID[id]; ok {
			ordered = append(ordered, v)
			descs = append(descs, v.Snippet.Description)
			positions = append(positions, firstPosition+i)
		}
	}
	summaries := domain.SummarizeDescriptions(descs)

	out := make([]*domain.ImportItemWithDetails, len(ordered))
	for i, v := range ordered {
		out[i] = channelVideoToItem(v, kind, positions[i], summaries[i], fetched)
	}
	return out, nil
}

func channelVideoToItem(v channelVideo, kind domain.ImportItemKind, position int, summary string, fetched time.Time) *domain.ImportItemWithDetails {
	item := domain.ImportItem{
		ExternalID:      v.ID,
		DestinationType: domain.ContentTypeYouTubeVideo,
		CanonicalURL:    NormalizeYouTubeURL(v.ID),
		Kind:            kind,
		Title:           v.Snippet.Title,
		ViewCount:       parseCount(v.Statistics.ViewCount),
		LikeCount:       parseCount(v.Statistics.LikeCount),
		CommentCount:    parseCount(v.Statistics.CommentCount),
		Position:        position,
		StatsFetchedAt:  fetched,
	}
	if summary != "" {
		item.Summary = &summary
	}
	if t, err := time.Parse(time.RFC3339, v.Snippet.PublishedAt); err == nil {
		item.PublishedAt = &t
	}
	if secs, err := ParseISO8601Duration(v.ContentDetails.Duration); err == nil && secs > 0 {
		item.DurationSeconds = &secs
	}
	if v.ContentDetails.Caption != "" {
		has := v.ContentDetails.Caption == "true"
		item.HasCaptions = &has
	}
	if thumb := bestThumbnail(v.Snippet.Thumbnails); thumb != "" {
		item.ThumbnailURL = &thumb
	}
	chapters := domain.ParseChapters(v.Snippet.Description)
	item.ChapterCount = len(chapters)

	return &domain.ImportItemWithDetails{
		Item: item,
		Details: domain.ImportItemDetails{
			Description: v.Snippet.Description,
			Tags:        v.Snippet.Tags,
			Chapters:    chapters,
			Links:       domain.LinkDomains(v.Snippet.Description),
			Language:    v.Snippet.DefaultAudioLanguage,
			Category:    v.Snippet.CategoryID,
		},
	}
}

// parseCount reads a statistics count. A missing field (likes hidden, comments
// off) stays nil, never 0.
func parseCount(s *string) *int64 {
	if s == nil {
		return nil
	}
	n, err := strconv.ParseInt(*s, 10, 64)
	if err != nil {
		return nil
	}
	return &n
}

// get calls a Data API endpoint with the key and decodes the JSON body into
// out. Errors never carry the URL (it contains the key): 404 maps to
// domain.ErrNotFound, anything else non-200 to domain.ErrYouTubeAPI.
func (l *ChannelLister) get(ctx context.Context, path string, q url.Values, out any) error {
	q.Set("key", l.c.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.c.baseURL+path+"?"+q.Encode(), nil)
	if err != nil {
		return fmt.Errorf("%w: failed to create request", domain.ErrYouTubeAPI)
	}
	resp, err := l.c.httpClient.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return fmt.Errorf("%w: request aborted: %w", domain.ErrYouTubeAPI, ctxErr)
		}
		slog.Error("YouTube import request failed", "path", path, "error", sanitizeYouTubeError(err))
		return fmt.Errorf("%w: request failed", domain.ErrYouTubeAPI)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return fmt.Errorf("%w: failed to read response", domain.ErrYouTubeAPI)
	}
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("%w: %s", domain.ErrNotFound, path)
	}
	if resp.StatusCode != http.StatusOK {
		slog.Error("YouTube import request returned error", "path", path, "status", resp.StatusCode)
		return fmt.Errorf("%w: status %d", domain.ErrYouTubeAPI, resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("%w: failed to parse %s response", domain.ErrYouTubeAPI, path)
	}
	return nil
}
