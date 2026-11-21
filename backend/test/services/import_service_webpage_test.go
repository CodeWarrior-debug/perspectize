package services_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// pageCreator records webpage and website creates for the import workers.
type pageCreator struct {
	*fakeCreator
	pmu          sync.Mutex
	websiteCalls []string
	pageCalls    []portservices.CreateWebPageInput
	// website decides each CreateFromWebsite call; nil creates content 700.
	website func(call int, url string) (*domain.Content, error)
	// existingPages maps a page url to the id of the row already saved for it.
	existingPages map[string]int
	nextPageID    int
}

func (c *pageCreator) CreateFromWebsite(_ context.Context, rawURL string, _ int) (*domain.Content, error) {
	c.pmu.Lock()
	c.websiteCalls = append(c.websiteCalls, rawURL)
	call := len(c.websiteCalls)
	c.pmu.Unlock()
	if c.website != nil {
		return c.website(call, rawURL)
	}
	return &domain.Content{ID: 700}, nil
}

func (c *pageCreator) CreateFromWebPage(_ context.Context, in portservices.CreateWebPageInput, _ int) (*domain.Content, error) {
	c.pmu.Lock()
	defer c.pmu.Unlock()
	c.pageCalls = append(c.pageCalls, in)
	if id, ok := c.existingPages[in.URL]; ok {
		return &domain.Content{ID: id}, domain.ErrAlreadyExists
	}
	c.nextPageID++
	return &domain.Content{ID: 800 + c.nextPageID}, nil
}

func (c *pageCreator) calls() (websites []string, pages []portservices.CreateWebPageInput) {
	c.pmu.Lock()
	defer c.pmu.Unlock()
	return append([]string(nil), c.websiteCalls...), append([]portservices.CreateWebPageInput(nil), c.pageCalls...)
}

var pagePublished = time.Date(2020, 1, 2, 3, 4, 5, 0, time.UTC)

// stagePages makes a CANDIDATE_FILE job with one source per entry of siteURLs
// (nil = no websiteUrl) and n page rows per source. It returns the job and the
// row ids per source index.
func stagePages(t *testing.T, repo *fakeImportRepo, siteURLs []*string, n int) (*domain.ImportJob, [][]int) {
	t.Helper()
	sources := make([]*domain.ImportSource, len(siteURLs))
	for i, u := range siteURLs {
		title := "Site " + string(rune('A'+i))
		sources[i] = &domain.ImportSource{
			SourceType: domain.ImportSourceCandidateFile, SourceRef: title, Title: &title, URL: u,
			DestinationType: domain.ContentTypeWebPage, Status: domain.ImportSourceStatusReady,
		}
	}
	job, err := repo.CreateJob(context.Background(), &domain.ImportJob{Name: "pages", RequestStatus: domain.ImportRequestStatusApproved, Sources: sources})
	require.NoError(t, err)

	ids := make([][]int, len(siteURLs))
	for i, src := range job.Sources {
		var batch []*domain.ImportItemWithDetails
		for j := range n {
			ext := string(rune('a'+i)) + string(rune('0'+j))
			summary := "summary " + ext
			thumb := "https://img.example/" + ext + ".jpg"
			published := pagePublished
			batch = append(batch, &domain.ImportItemWithDetails{
				Item: domain.ImportItem{
					JobID: job.ID, SourceID: src.ID, ExternalID: ext, DestinationType: domain.ContentTypeWebPage,
					CanonicalURL: "https://site" + string(rune('a'+i)) + ".com/" + ext, Title: "Title " + ext,
					Facts: domain.ImportFacts{
						Kind: domain.ImportItemKindPage, Summary: &summary, ThumbnailURL: &thumb,
						PublishedAt: &published, WebPageRoles: []string{"BLOG_POST"},
					},
				},
				Details: domain.ImportItemDetails{People: []domain.ImportPerson{
					{Name: "Editor", Role: "EDITOR"}, {Name: "Jane Doe", Role: "AUTHOR"},
				}},
			})
		}
		require.NoError(t, repo.UpsertItems(context.Background(), batch))
	}
	for id, it := range repo.items {
		for i, src := range job.Sources {
			if it.Item.SourceID == src.ID {
				ids[i] = append(ids[i], id)
			}
		}
	}
	return job, ids
}

func newPageImportService(repo *fakeImportRepo, creator *pageCreator, opts ...services.ImportServiceOption) *services.ImportService {
	return services.NewImportService(repo, nil, creator, append([]services.ImportServiceOption{inline, fixedNow}, opts...)...)
}

func TestImportWebPage_FilesPagesUnderTheWebsite(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/")}, 3)
	svc := newPageImportService(repo, creator)

	res, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0])
	require.NoError(t, err)
	assert.Equal(t, 3, res.Queued)

	websites, pages := creator.calls()
	assert.Equal(t, []string{"https://sitea.com/"}, websites, "the website is created once per batch")
	require.Len(t, pages, 3)
	for _, in := range pages {
		require.NotNil(t, in.ParentContentID)
		assert.Equal(t, 700, *in.ParentContentID)
		assert.Equal(t, []domain.WebPageRole{domain.WebPageRoleBlogPost}, in.Roles)
		require.NotNil(t, in.Prefetched)
		m := in.Prefetched
		ext := in.URL[len("https://sitea.com/"):]
		assert.Equal(t, "Title "+ext, *m.Title)
		assert.Equal(t, "summary "+ext, *m.Description)
		assert.Equal(t, "https://img.example/"+ext+".jpg", *m.ImageURL)
		assert.Equal(t, pagePublished.Format(time.RFC3339), *m.PublishedAt)
		assert.Equal(t, "Jane Doe", *m.Author, "the AUTHOR credit, not the editor")
		assert.Equal(t, "Site A", *m.SiteName)
		assert.Equal(t, domain.FetchStatusImported, m.Fetch.Status)
	}
	for _, id := range ids[0] {
		assert.Equal(t, domain.ImportItemStatusImported, *repo.items[id].Item.ImportStatus)
	}
	assert.Equal(t, 1, repo.getJobCalls, "sources are read once per batch, not per row")
	assert.Equal(t, 1, repo.detailsCalls, "details are read once per batch, not per row")
}

func TestImportWebPage_DetailsReadFailureFailsPageRowsClearly(t *testing.T) {
	repo := newFakeImportRepo()
	repo.detailsErr = errors.New("connection reset")
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/")}, 2)
	svc := newPageImportService(repo, creator)

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0])
	require.NoError(t, err)

	for _, id := range ids[0] {
		item := repo.items[id].Item
		assert.Equal(t, domain.ImportItemStatusFailed, *item.ImportStatus)
		assert.Equal(t, "couldn't read the staged page details. Try again later.", *item.ImportError)
	}
	_, pages := creator.calls()
	assert.Empty(t, pages)
}

func TestImportWebPage_NoWebsiteURLFilesNothing(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	job, ids := stagePages(t, repo, []*string{nil}, 2)
	svc := newPageImportService(repo, creator)

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0])
	require.NoError(t, err)

	websites, pages := creator.calls()
	assert.Empty(t, websites)
	require.Len(t, pages, 2)
	for _, in := range pages {
		assert.Nil(t, in.ParentContentID)
	}
}

func TestImportWebPage_ExistingPageIsSkippedAndNotReparented(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &pageCreator{fakeCreator: &fakeCreator{}, existingPages: map[string]int{"https://sitea.com/a0": 55}}
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/")}, 1)
	svc := newPageImportService(repo, creator)

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0])
	require.NoError(t, err)

	item := repo.items[ids[0][0]].Item
	assert.Equal(t, domain.ImportItemStatusSkipped, *item.ImportStatus)
	require.NotNil(t, item.ContentID)
	assert.Equal(t, 55, *item.ContentID, "the row links to the page already in the library")
	_, pages := creator.calls()
	assert.Len(t, pages, 1, "the existing page is not touched again")
}

func TestImportWebPage_ConcurrentBatchesShareTheWebsite(t *testing.T) {
	repo := newFakeImportRepo()
	// The first website create to arrive wins; the other gets the row back as ErrAlreadyExists.
	var once sync.Once
	arrived := make(chan struct{})
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	creator.website = func(_ int, _ string) (*domain.Content, error) {
		first := false
		once.Do(func() { first = true })
		if first {
			<-arrived // hold until the other batch is also creating
			return &domain.Content{ID: 700}, nil
		}
		close(arrived)
		return &domain.Content{ID: 700}, domain.ErrAlreadyExists
	}
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/")}, 4)
	var wg sync.WaitGroup
	svc := newPageImportService(repo, creator, goSpawn(&wg))

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0][:2])
	require.NoError(t, err)
	_, err = svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0][2:])
	require.NoError(t, err)
	wg.Wait()

	websites, pages := creator.calls()
	assert.Len(t, websites, 2, "each batch resolved the website")
	require.Len(t, pages, 4)
	for _, in := range pages {
		require.NotNil(t, in.ParentContentID)
		assert.Equal(t, 700, *in.ParentContentID)
	}
	for _, id := range ids[0] {
		assert.Equal(t, domain.ImportItemStatusImported, *repo.items[id].Item.ImportStatus)
	}
}

func TestImportWebPage_WebsiteFailureFailsOnlyThatSource(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	creator.website = func(_ int, url string) (*domain.Content, error) {
		if url == "https://siteb.com/" {
			return nil, errors.New("database is down")
		}
		return &domain.Content{ID: 700}, nil
	}
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/"), strPtr("https://siteb.com/")}, 2)
	svc := newPageImportService(repo, creator)

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, append(append([]int{}, ids[0]...), ids[1]...))
	require.NoError(t, err)

	for _, id := range ids[0] {
		assert.Equal(t, domain.ImportItemStatusImported, *repo.items[id].Item.ImportStatus)
	}
	for _, id := range ids[1] {
		item := repo.items[id].Item
		assert.Equal(t, domain.ImportItemStatusFailed, *item.ImportStatus)
		assert.Equal(t, "couldn't create the website", *item.ImportError)
	}
	_, pages := creator.calls()
	assert.Len(t, pages, 2, "no page of the failed source was created")
}
