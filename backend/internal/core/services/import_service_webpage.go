package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// errWebsiteCreate marks a page row whose website could not be found or created.
var errWebsiteCreate = errors.New("website not created")

// errPageDetails marks a page row whose staged details could not be read.
var errPageDetails = errors.New("page details not read")

// authorRole is the credit on a staged page that names its author.
const authorRole = "AUTHOR"

// pageSites is what a batch resolved about the websites its page rows belong
// to, once, before the workers start. A nil *pageSites means the batch has no
// page rows.
type pageSites struct {
	sources    map[int]*domain.ImportSource      // by source id
	websiteIDs map[int]*int                      // by source id; no entry = the source files under no website
	failed     map[int]error                     // by source id: why its website could not be created
	loadErr    error                             // the sources could not be read, so no row can be imported
	details    map[int]*domain.ImportItemDetails // by row id: the payloads of the page rows, read once
	detailsErr error                             // the payloads could not be read, so no page row can be imported
}

// resolveWebsites reads what the batch's page rows need before any worker
// starts: the details of every page row in one query, and the website of each
// source, found or created once however many rows it has. It finds or creates the website of every source that has page
// rows in items (each website once, however many rows). A website that already
// exists is success: ErrAlreadyExists carries the stored row.
func (s *ImportService) resolveWebsites(ctx context.Context, jobID, actorID int, items []*domain.ImportItem) *pageSites {
	var sourceIDs, pageIDs []int
	seen := map[int]bool{}
	for _, it := range items {
		if it.DestinationType != domain.ContentTypeWebPage {
			continue
		}
		pageIDs = append(pageIDs, it.ID)
		if !seen[it.SourceID] {
			seen[it.SourceID] = true
			sourceIDs = append(sourceIDs, it.SourceID)
		}
	}
	if len(sourceIDs) == 0 {
		return nil
	}

	sites := &pageSites{
		sources:    map[int]*domain.ImportSource{},
		websiteIDs: map[int]*int{},
		failed:     map[int]error{},
	}
	// The author lives in the row's details, which the batch read does not load.
	if details, err := s.repo.GetItemDetailsByIDs(ctx, jobID, pageIDs); err != nil {
		sites.detailsErr = fmt.Errorf("%w: %w", errPageDetails, err)
	} else {
		sites.details = details
	}
	job, err := s.repo.GetJob(ctx, jobID)
	if err != nil {
		sites.loadErr = fmt.Errorf("failed to load import sources: %w", err)
		return sites
	}
	for _, src := range job.Sources {
		sites.sources[src.ID] = src
	}

	createCtx := WithImportJobID(ctx, jobID)
	for _, id := range sourceIDs {
		src := sites.sources[id]
		if src == nil || src.URL == nil {
			continue
		}
		site, err := s.content.CreateFromWebsite(createCtx, *src.URL, actorID)
		if errors.Is(err, domain.ErrAlreadyExists) && site != nil {
			err = nil
		}
		if err == nil && site == nil {
			err = errors.New("no website returned")
		}
		if err != nil {
			slog.Warn("import website not created", "jobID", jobID, "sourceID", id, "error", err)
			sites.failed[id] = fmt.Errorf("%w: %w", errWebsiteCreate, err)
			continue
		}
		sites.websiteIDs[id] = &site.ID
	}
	return sites
}

// importWebPage saves one staged page from its row alone, with no fetch: the
// staged facts are the metadata. The page is filed under its source's website
// when the source has one.
func (s *ImportService) importWebPage(ctx context.Context, actorID int, it *domain.ImportItem, sites *pageSites) (*domain.Content, error) {
	if sites == nil {
		return nil, errors.New("page row imported without its sources")
	}
	if sites.loadErr != nil {
		return nil, sites.loadErr
	}
	if err := sites.failed[it.SourceID]; err != nil {
		return nil, err
	}
	if sites.detailsErr != nil {
		return nil, sites.detailsErr
	}
	var details domain.ImportItemDetails
	if d := sites.details[it.ID]; d != nil {
		details = *d
	}

	roles := make([]domain.WebPageRole, len(it.Facts.WebPageRoles))
	for i, r := range it.Facts.WebPageRoles {
		roles[i] = domain.WebPageRole(r)
	}
	var siteName *string
	if src := sites.sources[it.SourceID]; src != nil {
		siteName = src.Title
	}
	return s.content.CreateFromWebPage(ctx, portservices.CreateWebPageInput{
		URL:             it.CanonicalURL,
		Roles:           roles,
		ParentContentID: sites.websiteIDs[it.SourceID],
		Prefetched:      s.prefetchedPage(it, details, siteName),
	}, actorID)
}

// prefetchedPage builds the stored page metadata from a staged row.
func (s *ImportService) prefetchedPage(it *domain.ImportItem, details domain.ImportItemDetails, siteName *string) *domain.WebPageMeta {
	title := it.Title
	meta := &domain.WebPageMeta{
		SchemaVersion: domain.WebPageSchemaVersion,
		FinalURL:      it.CanonicalURL,
		SiteName:      siteName,
		Title:         &title,
		Description:   it.Facts.Summary,
		ImageURL:      it.Facts.ThumbnailURL,
		Fetch:         domain.WebPageFetch{Status: domain.FetchStatusImported, At: s.now()},
	}
	if it.Facts.PublishedAt != nil {
		published := it.Facts.PublishedAt.UTC().Format(time.RFC3339)
		meta.PublishedAt = &published
	}
	for _, p := range details.People {
		if p.Role == authorRole && p.Name != "" {
			name := p.Name
			meta.Author = &name
			break
		}
	}
	return meta
}
