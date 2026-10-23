// Package ytmusic reads track metadata from YouTube Music's unofficial InnerTube
// API. The response shapes follow ytmusicapi (github.com/sigma67/ytmusicapi).
// Nothing here is guaranteed by Google; callers treat every error as non-fatal.
package ytmusic

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	defaultBaseURL = "https://music.youtube.com/youtubei/v1"
	clientName     = "WEB_REMIX"
	clientVersion  = "1.20240904.01.00"
)

// Client implements portservices.YTMusicClient.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// NewClient returns a client with a short timeout, since enrichment must never stall an add.
func NewClient() *Client {
	return &Client{httpClient: &http.Client{Timeout: 3 * time.Second}, baseURL: defaultBaseURL}
}

type run struct {
	Text               string `json:"text"`
	NavigationEndpoint struct {
		BrowseEndpoint struct {
			Configs struct {
				Music struct {
					PageType string `json:"pageType"`
				} `json:"browseEndpointContextMusicConfig"`
			} `json:"browseEndpointContextSupportedConfigs"`
		} `json:"browseEndpoint"`
	} `json:"navigationEndpoint"`
}

type text struct {
	Runs []run `json:"runs"`
}

type videoRenderer struct {
	VideoID            string `json:"videoId"`
	Title              text   `json:"title"`
	LongBylineText     text   `json:"longBylineText"`
	LengthText         text   `json:"lengthText"`
	NavigationEndpoint struct {
		WatchEndpoint struct {
			Configs struct {
				Music struct {
					MusicVideoType string `json:"musicVideoType"`
				} `json:"watchEndpointMusicConfig"`
			} `json:"watchEndpointMusicSupportedConfigs"`
		} `json:"watchEndpoint"`
	} `json:"navigationEndpoint"`
}

type queueItem struct {
	Video   *videoRenderer `json:"playlistPanelVideoRenderer"`
	Wrapper *struct {
		Primary struct {
			Video *videoRenderer `json:"playlistPanelVideoRenderer"`
		} `json:"primaryRenderer"`
		Counterpart []struct {
			Renderer struct {
				Video *videoRenderer `json:"playlistPanelVideoRenderer"`
			} `json:"counterpartRenderer"`
		} `json:"counterpart"`
	} `json:"playlistPanelVideoWrapperRenderer"`
}

type nextResponse struct {
	Contents struct {
		Single struct {
			Tabbed struct {
				WatchNext struct {
					Tabs []struct {
						TabRenderer struct {
							Content struct {
								Queue struct {
									Content struct {
										Panel struct {
											Contents []queueItem `json:"contents"`
										} `json:"playlistPanelRenderer"`
									} `json:"content"`
								} `json:"musicQueueRenderer"`
							} `json:"content"`
						} `json:"tabRenderer"`
					} `json:"tabs"`
				} `json:"watchNextTabbedResultsRenderer"`
			} `json:"tabbedRenderer"`
		} `json:"singleColumnMusicWatchNextResultsRenderer"`
	} `json:"contents"`
}

// GetTrack calls InnerTube's `next` endpoint for videoID.
func (c *Client) GetTrack(ctx context.Context, videoID string) (*portservices.YTMusicTrack, error) {
	body, _ := json.Marshal(map[string]any{
		"context":     map[string]any{"client": map[string]string{"clientName": clientName, "clientVersion": clientVersion, "hl": "en", "gl": "US"}},
		"videoId":     videoID,
		"isAudioOnly": true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/next?prettyPrint=false", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://music.youtube.com")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ytmusic next: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ytmusic next: status %d", resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("ytmusic next: read: %w", err)
	}
	return ParseNext(raw, videoID)
}

// ParseNext extracts the track for videoID from a `next` response body.
func ParseNext(raw []byte, videoID string) (*portservices.YTMusicTrack, error) {
	var r nextResponse
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, fmt.Errorf("ytmusic next: decode: %w", err)
	}
	for _, tab := range r.Contents.Single.Tabbed.WatchNext.Tabs {
		for _, item := range tab.TabRenderer.Content.Queue.Content.Panel.Contents {
			primary, counterparts := item.Video, []*videoRenderer(nil)
			if item.Wrapper != nil {
				primary = item.Wrapper.Primary.Video
				for _, c := range item.Wrapper.Counterpart {
					counterparts = append(counterparts, c.Renderer.Video)
				}
			}
			all := append([]*videoRenderer{primary}, counterparts...)
			for i, v := range all {
				if v == nil || v.VideoID != videoID {
					continue
				}
				track := toTrack(v)
				for j, other := range all {
					if j != i && other != nil {
						track.Counterparts = append(track.Counterparts, portservices.YTMusicCounterpart{
							VideoID: other.VideoID, Title: joinRuns(other.Title), VideoType: videoType(other),
						})
					}
				}
				return track, nil
			}
		}
	}
	return nil, fmt.Errorf("ytmusic next: video %s not in response", videoID)
}

func toTrack(v *videoRenderer) *portservices.YTMusicTrack {
	t := &portservices.YTMusicTrack{Title: joinRuns(v.Title), VideoType: videoType(v), DurationSec: parseClock(joinRuns(v.LengthText))}
	for _, r := range v.LongBylineText.Runs {
		switch r.NavigationEndpoint.BrowseEndpoint.Configs.Music.PageType {
		case "MUSIC_PAGE_TYPE_ARTIST", "MUSIC_PAGE_TYPE_USER_CHANNEL":
			t.Artists = append(t.Artists, r.Text)
		case "MUSIC_PAGE_TYPE_ALBUM":
			t.Album = r.Text
		}
	}
	return t
}

func videoType(v *videoRenderer) string {
	switch v.NavigationEndpoint.WatchEndpoint.Configs.Music.MusicVideoType {
	case "MUSIC_VIDEO_TYPE_ATV":
		return "audio"
	case "MUSIC_VIDEO_TYPE_OMV":
		return "official_video"
	default:
		return "other"
	}
}

func joinRuns(t text) string {
	var b strings.Builder
	for _, r := range t.Runs {
		b.WriteString(r.Text)
	}
	return b.String()
}

// parseClock converts "m:ss" or "h:mm:ss" to seconds; 0 when unparseable.
func parseClock(s string) int {
	total := 0
	for _, part := range strings.Split(s, ":") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return 0
		}
		total = total*60 + n
	}
	return total
}
