package services

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"unicode/utf8"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/webpage"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// Limits on a staged file's rows. The URLs and text end up as links and labels
// other people see, so an admin-supplied file is still bounded.
const (
	maxFileExternalIDChars = 64
	maxFileTitleChars      = 300
	maxFileSummaryChars    = 600
	maxFileAuthorChars     = 200
	maxFileTags            = 20
	maxFileSourceTitle     = 200
)

// StageImportFromFile saves an admin-supplied candidates file as an APPROVED
// import with one READY source and every row staged. The whole file is checked
// before anything is saved (a bad row refuses it, naming the row), then written
// in three statements whatever the row count: the job and its source, all the
// rows, and the source's count.
func (s *ImportService) StageImportFromFile(ctx context.Context, actor *domain.AuthenticatedUser, in domain.StageImportFileInput) (*domain.ImportJob, error) {
	if !isImportAdmin(actor) {
		return nil, fmt.Errorf("%w: only an admin may stage an import from a file", domain.ErrForbidden)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return nil, fmt.Errorf("%w: import name must be 1-120 characters", domain.ErrInvalidInput)
	}
	if len(in.Items) == 0 || len(in.Items) > domain.MaxStagedFileItems {
		return nil, fmt.Errorf("%w: a file holds 1 to %s rows (this one has %s)",
			domain.ErrInvalidInput, formatThousands(domain.MaxStagedFileItems), formatThousands(len(in.Items)))
	}

	var websiteURL, sourceTitle *string
	if in.WebsiteURL != nil && strings.TrimSpace(*in.WebsiteURL) != "" {
		w := strings.TrimSpace(*in.WebsiteURL)
		if _, err := webpage.Canonicalize(w); err != nil {
			return nil, fmt.Errorf("%w: websiteUrl is not an http or https link", domain.ErrInvalidInput)
		}
		websiteURL = &w
	}
	if in.SourceTitle != nil && strings.TrimSpace(*in.SourceTitle) != "" {
		t := strings.TrimSpace(*in.SourceTitle)
		if utf8.RuneCountInString(t) > maxFileSourceTitle {
			return nil, fmt.Errorf("%w: sourceTitle is at most %d characters", domain.ErrInvalidInput, maxFileSourceTitle)
		}
		sourceTitle = &t
	}

	now := s.now().UTC()
	rows := make([]*domain.ImportItemWithDetails, len(in.Items))
	seen := make(map[string]struct{}, len(in.Items))
	for i, raw := range in.Items {
		row, err := validateFileRow(i+1, raw, websiteURL)
		if err != nil {
			return nil, err
		}
		if _, dup := seen[row.Item.ExternalID]; dup {
			return nil, fmt.Errorf("%w: row %d: externalId %q appears twice", domain.ErrInvalidInput, i+1, row.Item.ExternalID)
		}
		seen[row.Item.ExternalID] = struct{}{}
		row.Item.StatsFetchedAt = now
		rows[i] = row
	}

	ref := name
	if websiteURL != nil {
		ref = *websiteURL
	}
	created, err := s.repo.CreateJob(ctx, &domain.ImportJob{
		UserID:        actor.ID,
		Name:          name,
		RequestStatus: domain.ImportRequestStatusApproved,
		Sources: []*domain.ImportSource{{
			SourceType:      domain.ImportSourceCandidateFile,
			SourceRef:       ref,
			Title:           sourceTitle,
			URL:             websiteURL,
			DestinationType: domain.ImportSourceCandidateFile.DestinationType(),
			Status:          domain.ImportSourceStatusReady,
		}},
	})
	if err != nil {
		return nil, err
	}
	if len(created.Sources) != 1 {
		return nil, fmt.Errorf("staging a file: expected one source, got %d", len(created.Sources))
	}
	src := created.Sources[0]
	for _, r := range rows {
		r.Item.JobID, r.Item.SourceID = created.ID, src.ID
	}

	if err := s.repo.UpsertItems(ctx, rows); err != nil {
		detail := "Staging the file failed. Stage it again."
		failed := repositories.ImportSourceUpdate{Status: domain.ImportSourceStatusFailed, StatusDetail: &detail}
		if uerr := s.repo.UpdateSource(ctx, src.ID, failed); uerr != nil {
			slog.Error("staged file failure not saved", "sourceID", src.ID, "error", uerr)
		}
		return nil, fmt.Errorf("staging file rows: %w", err)
	}
	count := len(rows)
	if err := s.repo.UpdateSource(ctx, src.ID, repositories.ImportSourceUpdate{
		Status: domain.ImportSourceStatusReady, ItemCount: &count, FetchedAt: &now,
	}); err != nil {
		return nil, fmt.Errorf("saving the staged row count: %w", err)
	}
	src.ItemCount, src.FetchedAt = count, &now
	return created, nil
}

// validateFileRow checks one file row (n is its 1-based place in the file) and
// returns it as a staged item with a canonical URL.
func validateFileRow(n int, in domain.StageImportFileItem, websiteURL *string) (*domain.ImportItemWithDetails, error) {
	bad := func(format string, args ...any) error {
		return fmt.Errorf("%w: row %d: %s", domain.ErrInvalidInput, n, fmt.Sprintf(format, args...))
	}

	externalID := strings.TrimSpace(in.ExternalID)
	if externalID == "" || utf8.RuneCountInString(externalID) > maxFileExternalIDChars {
		return nil, bad("externalId must be 1-%d characters", maxFileExternalIDChars)
	}
	title := strings.TrimSpace(in.Title)
	if title == "" || utf8.RuneCountInString(title) > maxFileTitleChars {
		return nil, bad("title must be 1-%d characters", maxFileTitleChars)
	}
	if in.Position < 0 {
		return nil, bad("position can't be negative")
	}

	canonical, err := webpage.Canonicalize(in.URL)
	if err != nil {
		return nil, bad("url must be an http or https link")
	}
	if webpage.IsSiteRoot(canonical) {
		return nil, bad("url names a whole site, not a page")
	}
	if websiteURL != nil && !webpage.SameSite(canonical, *websiteURL) {
		return nil, bad("url is not on the website %s", *websiteURL)
	}

	facts := in.Facts
	if facts.ThumbnailURL != nil {
		if _, err := webpage.FetchURL(*facts.ThumbnailURL); err != nil {
			return nil, bad("thumbnailUrl must be an http or https link")
		}
	}
	if facts.Summary != nil && utf8.RuneCountInString(*facts.Summary) > maxFileSummaryChars {
		return nil, bad("summary is at most %d characters", maxFileSummaryChars)
	}
	for _, r := range facts.WebPageRoles {
		if !domain.WebPageRole(r).Valid() {
			return nil, bad("webPageRoles has an unknown role %q", r)
		}
	}
	details := in.Details
	if len(details.Tags) > maxFileTags {
		return nil, bad("at most %d tags", maxFileTags)
	}
	for _, p := range details.People {
		if utf8.RuneCountInString(p.Name) > maxFileAuthorChars {
			return nil, bad("a person's name is at most %d characters", maxFileAuthorChars)
		}
	}

	return &domain.ImportItemWithDetails{
		Item: domain.ImportItem{
			ExternalID:      externalID,
			DestinationType: domain.ContentTypeWebPage,
			CanonicalURL:    canonical,
			Title:           title,
			Facts:           facts,
			Position:        in.Position,
		},
		Details: details,
	}, nil
}
