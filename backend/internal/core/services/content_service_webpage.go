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
var ErrWebPageClientUnavailable = domain.Unavailable("webpage lookup is unavailable: no webpage client configured")

// CreateFromWebPage saves a webpage by URL, attributed to userID. The URL is
// canonicalised and checked against the library before any fetch, so a saved
// URL costs no request. The metadata is read once (unless in.Prefetched supplies
// it); a page that cannot be read is still saved, with its fetch status recorded.
// An address the SSRF check refuses saves nothing and returns domain.ErrInvalidInput,
// as does a site-root URL (that is a website) or a parent that is not a website
// on the same host.
//
// in.Roles are the adder's picks (the first is primary; empty means none). If the
// URL is already saved, the stored row wins and roles and parent are ignored.
func (s *ContentService) CreateFromWebPage(ctx context.Context, in portservices.CreateWebPageInput, userID int) (*domain.Content, error) {
	if s.webPage == nil {
		return nil, ErrWebPageClientUnavailable
	}
	canonical, err := webpage.Canonicalize(in.URL)
	if err != nil {
		return nil, err
	}
	if webpage.IsSiteRoot(canonical) {
		return nil, fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrWebPageIsWebsite)
	}
	roles, err := normaliseWebPageRoles(in.Roles)
	if err != nil {
		return nil, err
	}

	if existing, err := s.existingByURL(ctx, canonical); err != nil || existing != nil {
		return existing, orAlreadyExists(err)
	}

	if in.ParentContentID != nil && !in.ParentValidated {
		if err := s.validateWebsiteParent(ctx, *in.ParentContentID, canonical); err != nil {
			return nil, err
		}
	}

	var meta domain.WebPageMeta
	if in.Prefetched != nil {
		meta = *in.Prefetched
		meta.Fetch.Status = domain.FetchStatusImported
	} else if meta, err = s.fetchWebPage(ctx, in.URL); err != nil {
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
		Name:            webPageName(meta, key),
		URL:             &key,
		ContentType:     domain.ContentTypeWebPage,
		AddedByUserID:   userID,
		Response:        responseJSON,
		ParentContentID: in.ParentContentID,
	}
	return s.saveWebContent(ctx, content)
}

// CreateFromWebsite saves the website a link belongs to, keyed on its root URL
// (so a pasted page link still files the site). The metadata is read from the
// root; a site that cannot be read is still saved, named for its host. A website
// has no publish date or roles, so those keys are not stored.
func (s *ContentService) CreateFromWebsite(ctx context.Context, rawURL string, userID int) (*domain.Content, error) {
	if s.webPage == nil {
		return nil, ErrWebPageClientUnavailable
	}
	root, err := webpage.SiteRoot(rawURL)
	if err != nil {
		return nil, err
	}
	if existing, err := s.existingByURL(ctx, root); err != nil || existing != nil {
		return existing, orAlreadyExists(err)
	}

	meta, err := s.fetchWebPage(ctx, root)
	if err != nil {
		return nil, err
	}
	host := hostPathOf(root).host
	if meta.Domain == "" {
		meta.Domain = host
	}
	responseJSON, err := marshalWebsiteResponse(meta)
	if err != nil {
		return nil, err
	}

	name := host
	if meta.Title != nil && *meta.Title != "" {
		name = *meta.Title
	}
	content := &domain.Content{
		Name:          name,
		URL:           &root,
		ContentType:   domain.ContentTypeWebsite,
		AddedByUserID: userID,
		Response:      responseJSON,
	}
	return s.saveWebContent(ctx, content)
}

// existingByURL returns the saved row for a canonical URL, or (nil, nil) when
// there is none.
func (s *ContentService) existingByURL(ctx context.Context, canonical string) (*domain.Content, error) {
	existing, err := s.repo.GetByURL(ctx, canonical)
	if err == nil && existing != nil {
		return existing, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}
	return nil, nil
}

// orAlreadyExists is the error to return alongside an existing row: the lookup's
// own failure when it had one, else ErrAlreadyExists.
func orAlreadyExists(err error) error {
	if err != nil {
		return err
	}
	return domain.ErrAlreadyExists
}

// validateWebsiteParent checks, with one GetByID, that parentID is a WEBSITE row
// on the same host as the page being filed.
func (s *ContentService) validateWebsiteParent(ctx context.Context, parentID int, pageCanonical string) error {
	parent, err := s.repo.GetByID(ctx, parentID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentNotFound)
		}
		return fmt.Errorf("failed to load parent website: %w", err)
	}
	if parent == nil || parent.ContentType != domain.ContentTypeWebsite {
		return fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentNotWebsite)
	}
	if parent.URL == nil || !webpage.SameSite(*parent.URL, pageCanonical) {
		return fmt.Errorf("%w: %w", domain.ErrInvalidInput, domain.ErrParentOtherHost)
	}
	return nil
}

// saveWebContent inserts the row, tagging it with the running import job. A
// concurrent insert of the same URL keeps the stored row (refreshOnConflict false)
// and returns it with ErrAlreadyExists.
func (s *ContentService) saveWebContent(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	if jobID, ok := importJobIDFrom(ctx); ok {
		content.ImportJobID = &jobID
	}
	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, false)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}
	return created, nil
}

// marshalWebsiteResponse stores the fetched metadata without the page-only keys.
func marshalWebsiteResponse(meta domain.WebPageMeta) (json.RawMessage, error) {
	raw, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal website response: %w", err)
	}
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return nil, fmt.Errorf("failed to marshal website response: %w", err)
	}
	delete(keys, "publishedAt")
	delete(keys, "webPageRoles")
	out, err := json.Marshal(keys)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal website response: %w", err)
	}
	return out, nil
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
