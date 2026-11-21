package services_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// countingImportRepo counts the write statements staging a file costs.
type countingImportRepo struct {
	*fakeImportRepo
	createJobs, upserts, sourceUpdates int
	lastUpsert                         []*domain.ImportItemWithDetails
}

func (r *countingImportRepo) CreateJob(ctx context.Context, job *domain.ImportJob) (*domain.ImportJob, error) {
	r.createJobs++
	return r.fakeImportRepo.CreateJob(ctx, job)
}

func (r *countingImportRepo) UpsertItems(ctx context.Context, items []*domain.ImportItemWithDetails) error {
	r.upserts++
	r.lastUpsert = items
	return r.fakeImportRepo.UpsertItems(ctx, items)
}

func (r *countingImportRepo) UpdateSource(ctx context.Context, id int, u repositories.ImportSourceUpdate) error {
	r.sourceUpdates++
	return r.fakeImportRepo.UpdateSource(ctx, id, u)
}

func newFileStagingService() (*services.ImportService, *countingImportRepo) {
	repo := &countingImportRepo{fakeImportRepo: newFakeImportRepo()}
	svc := services.NewImportService(repo, map[domain.ImportSourceType]portservices.ImportSourceLister{}, &fakeCreator{}, inline, fixedNow)
	return svc, repo
}

func fileRow(i int) domain.StageImportFileItem {
	return domain.StageImportFileItem{
		ExternalID: fmt.Sprintf("post-%d", i),
		URL:        fmt.Sprintf("https://www.Example.com/2026/05/post-%d/?utm_source=x", i),
		Title:      fmt.Sprintf("Post %d", i),
		Position:   i,
		Facts:      domain.ImportFacts{Kind: domain.ImportItemKindPage, WebPageRoles: []string{"BLOG_POST"}},
	}
}

func fileRows(n int) []domain.StageImportFileItem {
	rows := make([]domain.StageImportFileItem, n)
	for i := range rows {
		rows[i] = fileRow(i)
	}
	return rows
}

func TestStageImportFromFile_AdminOnly(t *testing.T) {
	svc, repo := newFileStagingService()
	in := domain.StageImportFileInput{Name: "Blog", Items: fileRows(1)}

	_, err := svc.StageImportFromFile(context.Background(), importUser, in)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	_, err = svc.StageImportFromFile(context.Background(), nil, in)
	assert.ErrorIs(t, err, domain.ErrForbidden)
	assert.Zero(t, repo.createJobs)
}

func TestStageImportFromFile_CreateImportJobRefusesCandidateFileSource(t *testing.T) {
	svc, _ := newFileStagingService()
	_, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name:    "x",
		Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceCandidateFile, Ref: "anything"}},
	})
	require.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Contains(t, err.Error(), "not configured")
}

func TestStageImportFromFile_HappyPath(t *testing.T) {
	svc, repo := newFileStagingService()
	site := "https://example.com/"
	title := "Example Blog"
	rows := fileRows(3)
	thumb := "https://example.com/a.jpg"
	rows[0].Facts.ThumbnailURL = &thumb

	job, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{
		Name: " Blog import ", SourceTitle: &title, WebsiteURL: &site, Items: rows,
	})
	require.NoError(t, err)

	assert.Equal(t, "Blog import", job.Name)
	assert.Equal(t, importAdmin.ID, job.UserID)
	assert.Equal(t, domain.ImportRequestStatusApproved, job.RequestStatus)
	require.Len(t, job.Sources, 1)
	src := job.Sources[0]
	assert.Equal(t, domain.ImportSourceCandidateFile, src.SourceType)
	assert.Equal(t, domain.ContentTypeWebPage, src.DestinationType)
	assert.Equal(t, domain.ImportSourceStatusReady, src.Status)
	assert.NotEmpty(t, src.SourceRef)
	require.NotNil(t, src.URL)
	assert.Equal(t, site, *src.URL)
	require.NotNil(t, src.Title)
	assert.Equal(t, title, *src.Title)

	stored := repo.source(src.ID)
	assert.Equal(t, 3, stored.ItemCount)
	require.NotNil(t, stored.FetchedAt)
	assert.Equal(t, time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC), stored.FetchedAt.UTC())

	assert.Equal(t, 1, repo.createJobs)
	assert.Equal(t, 1, repo.upserts)
	require.Len(t, repo.lastUpsert, 3)
	for i, it := range repo.lastUpsert {
		assert.Equal(t, job.ID, it.Item.JobID)
		assert.Equal(t, src.ID, it.Item.SourceID)
		assert.Equal(t, domain.ContentTypeWebPage, it.Item.DestinationType)
		assert.Equal(t, fmt.Sprintf("https://example.com/2026/05/post-%d", i), it.Item.CanonicalURL)
		assert.Equal(t, fmt.Sprintf("post-%d", i), it.Item.ExternalID)
		assert.Equal(t, i, it.Item.Position)
		assert.Equal(t, []string{"BLOG_POST"}, it.Item.Facts.WebPageRoles)
		assert.False(t, it.Item.StatsFetchedAt.IsZero())
	}
}

func TestStageImportFromFile_RefusesWholeFile(t *testing.T) {
	site := "https://example.com/"
	with := func(mutate func(rows []domain.StageImportFileItem)) []domain.StageImportFileItem {
		rows := fileRows(3)
		mutate(rows)
		return rows
	}
	bad := "javascript:alert(1)"
	ftp := "ftp://example.com/a.jpg"

	cases := []struct {
		name    string
		in      domain.StageImportFileInput
		mention string
	}{
		{"other host", domain.StageImportFileInput{Name: "x", WebsiteURL: &site, Items: with(func(r []domain.StageImportFileItem) { r[1].URL = "https://other.org/post" })}, "row 2"},
		{"subdomain is another site", domain.StageImportFileInput{Name: "x", WebsiteURL: &site, Items: with(func(r []domain.StageImportFileItem) { r[0].URL = "https://blog.example.com/post" })}, "row 1"},
		{"duplicate externalId", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[2].ExternalID = r[0].ExternalID })}, "row 3"},
		{"empty items", domain.StageImportFileInput{Name: "x"}, ""},
		{"too many items", domain.StageImportFileInput{Name: "x", Items: fileRows(5001)}, ""},
		{"externalId too long", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].ExternalID = strings.Repeat("a", 65) })}, "row 2"},
		{"empty externalId", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].ExternalID = " " })}, "row 2"},
		{"title too long", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].Title = strings.Repeat("t", 301) })}, "row 2"},
		{"empty title", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].Title = "  " })}, "row 2"},
		{"javascript url", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].URL = bad })}, "row 2"},
		{"non-http thumbnail", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].Facts.ThumbnailURL = &ftp })}, "row 2"},
		{"site root row", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].URL = "https://x.com/" })}, "row 2"},
		{"summary too long", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].Facts.Summary = strPtr(strings.Repeat("s", 601)) })}, "row 2"},
		{"author too long", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) {
			r[1].Details.People = []domain.ImportPerson{{Name: strings.Repeat("a", 201), Role: "author"}}
		})}, "row 2"},
		{"too many tags", domain.StageImportFileInput{Name: "x", Items: with(func(r []domain.StageImportFileItem) { r[1].Details.Tags = make([]string, 21) })}, "row 2"},
		{"bad website url", domain.StageImportFileInput{Name: "x", WebsiteURL: &bad, Items: fileRows(1)}, ""},
		{"blank name", domain.StageImportFileInput{Name: " ", Items: fileRows(1)}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo := newFileStagingService()
			_, err := svc.StageImportFromFile(context.Background(), importAdmin, tc.in)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			if tc.mention != "" {
				assert.Contains(t, err.Error(), tc.mention)
			}
			assert.Zero(t, repo.createJobs, "nothing is saved")
			assert.Zero(t, repo.upserts)
			assert.Empty(t, repo.jobs)
		})
	}
}

func TestStageImportFromFile_SiteRootRowRejectedButQueryAccepted(t *testing.T) {
	svc, _ := newFileStagingService()
	row := func(u string) []domain.StageImportFileItem {
		r := fileRow(0)
		r.URL = u
		return []domain.StageImportFileItem{r}
	}
	_, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: row("https://x.com/")})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)

	job, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: row("https://x.com/?p=12")})
	require.NoError(t, err)
	assert.Equal(t, 1, job.Sources[0].ItemCount)
}

func TestStageImportFromFile_NoWebsiteAcceptsMixedHosts(t *testing.T) {
	svc, repo := newFileStagingService()
	rows := fileRows(2)
	rows[1].URL = "https://other.org/a-post"

	job, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: rows})
	require.NoError(t, err)
	assert.Nil(t, job.Sources[0].URL)
	assert.Len(t, repo.lastUpsert, 2)
}

func TestStageImportFromFile_StatementCountIsConstant(t *testing.T) {
	for _, n := range []int{1, 1000} {
		svc, repo := newFileStagingService()
		_, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: fileRows(n)})
		require.NoError(t, err)
		assert.Equal(t, 1, repo.createJobs, "job + sources is one CreateJob (2 statements) for %d rows", n)
		assert.Equal(t, 1, repo.upserts, "items are one statement for %d rows", n)
		assert.Equal(t, 1, repo.sourceUpdates, "one source update for %d rows", n)
	}
}
