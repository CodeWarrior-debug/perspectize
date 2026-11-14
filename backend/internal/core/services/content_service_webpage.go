package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/webpage"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ErrWebPageClientUnavailable is returned by CreateFromWebPage and PreviewWebPage
// when the service was built without a webpage client.
var ErrWebPageClientUnavailable = errors.New("webpage lookup is unavailable: no webpage client configured")

// CreateFromWebPage saves a webpage by URL, attributed to userID. The URL is
// canonicalised and checked against the library before any fetch, so a saved
// URL costs no request. The metadata is read once; a page that cannot be read
// is still saved, with its fetch status recorded. An address the SSRF check
// refuses saves nothing and returns domain.ErrInvalidInput.
//
// roles are the adder's picks (the first is primary; empty means a plain
// webpage). If the URL is already saved, the stored row wins and roles is ignored.
func (s *ContentService) CreateFromWebPage(ctx context.Context, rawURL string, roles []domain.WebPageRole, userID int) (*domain.Content, error) {
	if s.webPage == nil {
		return nil, ErrWebPageClientUnavailable
	}
	canonical, err := webpage.Canonicalize(rawURL)
	if err != nil {
		return nil, err
	}
	roles, err = normaliseWebPageRoles(roles)
	if err != nil {
		return nil, err
	}

	existing, err := s.repo.GetByURL(ctx, canonical)
	if err == nil && existing != nil {
		return existing, domain.ErrAlreadyExists
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}

	meta, err := s.fetchWebPage(ctx, rawURL)
	if err != nil {
		return nil, err
	}

	key := webPageKey(canonical, meta)
	meta.Roles = roles
	if meta.Domain == "" {
		meta.Domain = hostPathOf(key).host
	}
	responseJSON, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal webpage response: %w", err)
	}

	content := &domain.Content{
		Name:          webPageName(meta, key),
		URL:           &key,
		ContentType:   domain.ContentTypeWebPage,
		AddedByUserID: userID,
		Response:      responseJSON,
	}
	if jobID, ok := importJobIDFrom(ctx); ok {
		content.ImportJobID = &jobID
	}

	// refreshOnConflict is false: a concurrent insert of the same URL keeps the
	// stored row and its roles (D11).
	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, false)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}
	return created, nil
}

// PreviewWebPage reads a page's metadata for the Add dialog. It never writes.
// When the page is already saved, the preview carries that row's ID so the
// dialog can offer "open it" instead of Save.
func (s *ContentService) PreviewWebPage(ctx context.Context, rawURL string) (*portservices.WebPagePreview, error) {
	if s.webPage == nil {
		return nil, ErrWebPageClientUnavailable
	}
	canonical, err := webpage.Canonicalize(rawURL)
	if err != nil {
		return nil, err
	}
	meta, err := s.fetchWebPage(ctx, rawURL)
	if err != nil {
		return nil, err
	}

	preview := &portservices.WebPagePreview{Meta: meta}
	keys := []string{canonical}
	if key := webPageKey(canonical, meta); key != canonical {
		keys = append(keys, key)
	}
	for _, k := range keys {
		existing, err := s.repo.GetByURL(ctx, k)
		if err == nil && existing != nil {
			id := existing.ID
			preview.AlreadyExistsContentID = &id
			break
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check existing content: %w", err)
		}
	}
	return preview, nil
}

// fetchWebPage reads the page at the URL as pasted (minus userinfo and fragment),
// so a site that serves only one form of its URLs still reads. The row is still
// keyed on the canonical URL. Only an SSRF refusal (domain.ErrInvalidInput) is
// returned as an error; every other outcome is carried in Fetch.Status.
func (s *ContentService) fetchWebPage(ctx context.Context, rawURL string) (domain.WebPageMeta, error) {
	fetchURL, err := webpage.FetchURL(rawURL)
	if err != nil {
		return domain.WebPageMeta{}, err
	}
	meta, err := s.webPage.Fetch(ctx, fetchURL)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return domain.WebPageMeta{}, err
		}
		return domain.WebPageMeta{}, fmt.Errorf("failed to read webpage: %w", err)
	}
	return meta, nil
}

// webPageKey is the URL the row is stored under: the page's declared canonical
// when it names the host of the page actually read, else the requested canonical.
func webPageKey(canonical string, meta domain.WebPageMeta) string {
	return webpage.PreferDeclaredCanonical(canonical, meta.FinalURL, meta.DeclaredCanonical)
}

// webPageName is the page title, or host + path when the page has no title.
func webPageName(meta domain.WebPageMeta, key string) string {
	if meta.Title != nil && *meta.Title != "" {
		return *meta.Title
	}
	hp := hostPathOf(key)
	return hp.host + hp.path
}

type hostPath struct {
	host string
	path string
}

// hostPathOf splits a canonical URL into host and escaped path, without scheme or query.
func hostPathOf(raw string) hostPath {
	u, err := url.Parse(raw)
	if err != nil {
		return hostPath{host: raw}
	}
	return hostPath{host: u.Hostname(), path: u.EscapedPath()}
}

// normaliseWebPageRoles rejects unknown roles and drops duplicates, keeping the
// first-seen order (the first role is primary).
func normaliseWebPageRoles(in []domain.WebPageRole) ([]domain.WebPageRole, error) {
	out := make([]domain.WebPageRole, 0, len(in))
	seen := make(map[domain.WebPageRole]bool, len(in))
	for _, r := range in {
		if !r.IsValid() {
			return nil, fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrUnknownWebPageRole)
		}
		if seen[r] {
			continue
		}
		seen[r] = true
		out = append(out, r)
	}
	return out, nil
}
