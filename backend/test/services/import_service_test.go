package services_test

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- in-memory fakes ----------------------------------------------------------

// fakeImportRepo is an in-memory repositories.ImportJobRepository. libraryURLs
// stands in for the content table's URLs (the "in library" join).
type fakeImportRepo struct {
	mu          sync.Mutex
	jobs        map[int]*domain.ImportJob
	items       map[int]*domain.ImportItemWithDetails
	libraryURLs map[string]int
	nextID      int
	upsertErr   error
	updates     []repositories.ImportSourceUpdate
}

var _ repositories.ImportJobRepository = (*fakeImportRepo)(nil)

func newFakeImportRepo() *fakeImportRepo {
	return &fakeImportRepo{jobs: map[int]*domain.ImportJob{}, items: map[int]*domain.ImportItemWithDetails{}, libraryURLs: map[string]int{}}
}

func (r *fakeImportRepo) id() int { r.nextID++; return r.nextID }

func (r *fakeImportRepo) CreateJob(_ context.Context, job *domain.ImportJob) (*domain.ImportJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *job
	cp.ID = r.id()
	cp.Sources = nil
	for _, s := range job.Sources {
		sc := *s
		sc.ID, sc.JobID = r.id(), cp.ID
		cp.Sources = append(cp.Sources, &sc)
	}
	r.jobs[cp.ID] = &cp
	return &cp, nil
}

func (r *fakeImportRepo) ListJobs(context.Context) ([]*domain.ImportJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []*domain.ImportJob{}
	for _, j := range r.jobs {
		out = append(out, j)
	}
	return out, nil
}

func (r *fakeImportRepo) GetJob(_ context.Context, id int) (*domain.ImportJob, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if j, ok := r.jobs[id]; ok {
		return j, nil
	}
	return nil, domain.ErrNotFound
}

func (r *fakeImportRepo) source(id int) *domain.ImportSource {
	for _, j := range r.jobs {
		for _, s := range j.Sources {
			if s.ID == id {
				return s
			}
		}
	}
	return nil
}

func (r *fakeImportRepo) UpdateSource(_ context.Context, sourceID int, u repositories.ImportSourceUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.updates = append(r.updates, u)
	s := r.source(sourceID)
	if s == nil {
		return domain.ErrNotFound
	}
	s.Status, s.StatusDetail = u.Status, u.StatusDetail
	if u.ItemCount != nil {
		s.ItemCount = *u.ItemCount
	}
	if u.FetchedAt != nil {
		s.FetchedAt = u.FetchedAt
	}
	return nil
}

func (r *fakeImportRepo) UpsertItems(_ context.Context, items []*domain.ImportItemWithDetails) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.upsertErr != nil {
		return r.upsertErr
	}
	for _, it := range items {
		cp := *it
		cp.Item.ID = r.id()
		r.items[cp.Item.ID] = &cp
	}
	return nil
}

func (r *fakeImportRepo) withLibrary(it domain.ImportItem) *domain.ImportItem {
	if id, ok := r.libraryURLs[it.CanonicalURL]; ok {
		it.InLibrary = true
		if it.ContentID == nil {
			it.ContentID = &id
		}
	}
	return &it
}

func (r *fakeImportRepo) ListItems(_ context.Context, jobID int) ([]*domain.ImportItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []*domain.ImportItem{}
	for _, it := range r.items {
		if it.Item.JobID == jobID {
			out = append(out, r.withLibrary(it.Item))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

func (r *fakeImportRepo) GetItemsByIDs(_ context.Context, jobID int, ids []int) ([]*domain.ImportItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []*domain.ImportItem{}
	for _, id := range ids {
		if it, ok := r.items[id]; ok && it.Item.JobID == jobID {
			out = append(out, r.withLibrary(it.Item))
		}
	}
	return out, nil
}

func (r *fakeImportRepo) GetItemWithDetails(_ context.Context, itemID int) (*domain.ImportItemWithDetails, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if it, ok := r.items[itemID]; ok {
		return it, nil
	}
	return nil, domain.ErrNotFound
}

func (r *fakeImportRepo) MarkQueued(_ context.Context, jobID int, ids []int) ([]int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []int{}
	for _, id := range ids {
		it, ok := r.items[id]
		if !ok || it.Item.JobID != jobID {
			continue
		}
		if st := it.Item.ImportStatus; st == nil || *st == domain.ImportItemStatusFailed {
			q := domain.ImportItemStatusQueued
			it.Item.ImportStatus = &q
			out = append(out, id)
		}
	}
	return out, nil
}

func (r *fakeImportRepo) RecordOutcome(_ context.Context, itemID int, status domain.ImportItemStatus, errMsg *string, contentID *int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	it := r.items[itemID]
	it.Item.ImportStatus, it.Item.ImportError = &status, errMsg
	if contentID != nil {
		it.Item.ContentID = contentID
	}
	return nil
}

func (r *fakeImportRepo) FailInterrupted(context.Context, string) (int, int, error) { return 1, 2, nil }
func (r *fakeImportRepo) ReassignByUser(context.Context, int, int) error            { return nil }

// fakeLister resolves any ref to itself and emits the given batches.
type fakeLister struct {
	batches    [][]*domain.ImportItemWithDetails
	listErr    error
	resolveErr error
	gotRole    *domain.ImportPersonRole
}

func (l *fakeLister) Resolve(_ context.Context, ref string) (*portservices.ResolvedImportSource, error) {
	if l.resolveErr != nil {
		return nil, l.resolveErr
	}
	return &portservices.ResolvedImportSource{ID: "id-" + ref, Title: "Title " + ref, URL: "https://example.com/" + ref}, nil
}

func (l *fakeLister) List(_ context.Context, _ portservices.ResolvedImportSource, role *domain.ImportPersonRole, emit portservices.ImportBatchFunc) error {
	l.gotRole = role
	for _, b := range l.batches {
		if err := emit(b); err != nil {
			return err
		}
	}
	return l.listErr
}

func candidate(ext string, dest domain.ContentType) *domain.ImportItemWithDetails {
	url := "https://www.youtube.com/watch?v=" + ext
	if dest == domain.ContentTypeMovie {
		url = "https://www.themoviedb.org/movie/" + ext
	}
	return &domain.ImportItemWithDetails{Item: domain.ImportItem{ExternalID: ext, DestinationType: dest, CanonicalURL: url, Kind: domain.ImportItemKindVideo, Title: ext}}
}

// fakeCreator records content creation; urls in exists report ErrAlreadyExists, in fail fail.
type fakeCreator struct {
	mu      sync.Mutex
	youtube []string
	movies  []string
	userIDs []int
	exists  map[string]bool
	fail    map[string]error
}

func (c *fakeCreator) create(url string, userID int, list *[]string) (*domain.Content, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	*list = append(*list, url)
	c.userIDs = append(c.userIDs, userID)
	if err := c.fail[url]; err != nil {
		return nil, err
	}
	if c.exists[url] {
		return &domain.Content{ID: 900}, domain.ErrAlreadyExists
	}
	return &domain.Content{ID: 100 + len(*list)}, nil
}

func (c *fakeCreator) CreateFromYouTube(_ context.Context, url string, userID int) (*domain.Content, error) {
	return c.create(url, userID, &c.youtube)
}

func (c *fakeCreator) CreateFromMovie(_ context.Context, url string, userID int) (*domain.Content, error) {
	return c.create(url, userID, &c.movies)
}

var (
	importAdmin = &domain.AuthenticatedUser{ID: 1, Role: domain.UserRoleAdmin}
	importUser  = &domain.AuthenticatedUser{ID: 2, Role: domain.UserRoleDefault}
	inline      = services.WithImportSpawn(func(f func()) { f() })
	fixedNow    = services.WithImportClock(func() time.Time { return time.Date(2026, 10, 27, 0, 0, 0, 0, time.UTC) })
)

func newImportService(repo *fakeImportRepo, yt, tmdb *fakeLister, creator *fakeCreator) *services.ImportService {
	listers := map[domain.ImportSourceType]portservices.ImportSourceLister{}
	if yt != nil {
		listers[domain.ImportSourceYouTubeChannel] = yt
	}
	if tmdb != nil {
		listers[domain.ImportSourceTMDBPerson] = tmdb
	}
	return services.NewImportService(repo, listers, creator, inline, fixedNow)
}

// --- tests --------------------------------------------------------------------

func TestImportService_CreateImportJob_ListsEverySource(t *testing.T) {
	repo := newFakeImportRepo()
	yt := &fakeLister{batches: [][]*domain.ImportItemWithDetails{
		{candidate("a", domain.ContentTypeYouTubeVideo), candidate("b", domain.ContentTypeYouTubeVideo)},
		{candidate("c", domain.ContentTypeYouTubeVideo)},
	}}
	tmdb := &fakeLister{batches: [][]*domain.ImportItemWithDetails{{candidate("27205", domain.ContentTypeMovie)}}}
	svc := newImportService(repo, yt, tmdb, &fakeCreator{})
	director := domain.ImportPersonRoleDirector

	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "  Peterson and Nolan ",
		Sources: []domain.CreateImportSourceInput{
			{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@JordanBPeterson"},
			{SourceType: domain.ImportSourceTMDBPerson, Ref: "525", Role: &director},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "Peterson and Nolan", job.Name)
	require.Len(t, job.Sources, 2)
	assert.Equal(t, "Title @JordanBPeterson", *job.Sources[0].Title)
	assert.Equal(t, domain.ContentTypeMovie, job.Sources[1].DestinationType)
	assert.Equal(t, &director, tmdb.gotRole)

	stored, err := svc.GetImportJob(context.Background(), job.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportSourceStatusReady, stored.Sources[0].Status)
	assert.Equal(t, 3, stored.Sources[0].ItemCount)
	assert.Equal(t, 1, stored.Sources[1].ItemCount)
	require.NotNil(t, stored.Sources[0].FetchedAt)

	items, err := svc.ListImportItems(context.Background(), job.ID)
	require.NoError(t, err)
	require.Len(t, items, 4)
	for _, it := range items {
		assert.Equal(t, job.ID, it.JobID, "service stamps the job and source on each candidate")
		assert.NotZero(t, it.SourceID)
	}

	// Progress is written after each batch, then the final READY.
	statuses := make([]domain.ImportSourceStatus, len(repo.updates))
	for i, u := range repo.updates {
		statuses[i] = u.Status
	}
	assert.Contains(t, statuses, domain.ImportSourceStatusListing)
}

func TestImportService_CreateImportJob_Validation(t *testing.T) {
	repo := newFakeImportRepo()
	svc := newImportService(repo, &fakeLister{}, nil, &fakeCreator{})
	ctx := context.Background()
	yt := []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x"}}
	cast := domain.ImportPersonRoleCast
	tooMany := make([]domain.CreateImportSourceInput, domain.MaxImportSourcesPerJob+1)
	for i := range tooMany {
		tooMany[i] = yt[0]
	}

	tests := []struct {
		name  string
		actor *domain.AuthenticatedUser
		input domain.CreateImportJobInput
		want  error
	}{
		{"anonymous", nil, domain.CreateImportJobInput{Name: "x", Sources: yt}, domain.ErrForbidden},
		{"not an admin", importUser, domain.CreateImportJobInput{Name: "x", Sources: yt}, domain.ErrForbidden},
		{"blank name", importAdmin, domain.CreateImportJobInput{Name: "  ", Sources: yt}, domain.ErrInvalidInput},
		{"no sources", importAdmin, domain.CreateImportJobInput{Name: "x"}, domain.ErrInvalidInput},
		{"too many sources", importAdmin, domain.CreateImportJobInput{Name: "x", Sources: tooMany}, domain.ErrInvalidInput},
		{"unknown type", importAdmin, domain.CreateImportJobInput{Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: "RSS", Ref: "x"}}}, domain.ErrInvalidInput},
		{"type not configured", importAdmin, domain.CreateImportJobInput{Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceTMDBPerson, Ref: "525"}}}, domain.ErrInvalidInput},
		{"role on a channel", importAdmin, domain.CreateImportJobInput{Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x", Role: &cast}}}, domain.ErrInvalidInput},
		{"blank ref", importAdmin, domain.CreateImportJobInput{Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: " "}}}, domain.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := svc.CreateImportJob(ctx, tt.actor, tt.input)
			assert.ErrorIs(t, err, tt.want)
		})
	}
	assert.Empty(t, repo.jobs, "nothing is saved when validation fails")
}

func TestImportService_CreateImportJob_ResolveFailureSavesNothing(t *testing.T) {
	repo := newFakeImportRepo()
	svc := newImportService(repo, &fakeLister{resolveErr: fmt.Errorf("%w: no channel", domain.ErrNotFound)}, nil, &fakeCreator{})
	_, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@nobody"}},
	})
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Contains(t, err.Error(), "@nobody")
	assert.Empty(t, repo.jobs)
}

func TestImportService_ListingFailureKeepsWhatWasStaged(t *testing.T) {
	repo := newFakeImportRepo()
	yt := &fakeLister{
		batches: [][]*domain.ImportItemWithDetails{{candidate("a", domain.ContentTypeYouTubeVideo)}},
		listErr: fmt.Errorf("%w: status 403", domain.ErrYouTubeAPI),
	}
	svc := newImportService(repo, yt, nil, &fakeCreator{})
	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x"}},
	})
	require.NoError(t, err)
	src := repo.jobs[job.ID].Sources[0]
	assert.Equal(t, domain.ImportSourceStatusFailed, src.Status)
	assert.Equal(t, 1, src.ItemCount)
	require.NotNil(t, src.StatusDetail)
	assert.Equal(t, "Stopped after 1 items: YouTube refused the request (often the daily quota).", *src.StatusDetail)
	assert.NotContains(t, *src.StatusDetail, "403", "upstream detail stays in the logs")
}

func TestImportService_StagingFailureFailsTheSource(t *testing.T) {
	repo := newFakeImportRepo()
	repo.upsertErr = errors.New("db down")
	yt := &fakeLister{batches: [][]*domain.ImportItemWithDetails{{candidate("a", domain.ContentTypeYouTubeVideo)}, {candidate("b", domain.ContentTypeYouTubeVideo)}}}
	svc := newImportService(repo, yt, nil, &fakeCreator{})
	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x"}},
	})
	require.NoError(t, err)
	src := repo.jobs[job.ID].Sources[0]
	assert.Equal(t, domain.ImportSourceStatusFailed, src.Status)
	assert.Equal(t, 0, src.ItemCount)
}

// stageJob creates a job whose YouTube source staged a, b, c and whose TMDB source staged one movie.
func stageJob(t *testing.T, repo *fakeImportRepo, creator *fakeCreator) (*services.ImportService, *domain.ImportJob, map[string]int) {
	t.Helper()
	yt := &fakeLister{batches: [][]*domain.ImportItemWithDetails{{candidate("a", domain.ContentTypeYouTubeVideo), candidate("b", domain.ContentTypeYouTubeVideo), candidate("c", domain.ContentTypeYouTubeVideo)}}}
	tmdb := &fakeLister{batches: [][]*domain.ImportItemWithDetails{{candidate("27205", domain.ContentTypeMovie)}}}
	svc := newImportService(repo, yt, tmdb, creator)
	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "x", Sources: []domain.CreateImportSourceInput{
			{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x"},
			{SourceType: domain.ImportSourceTMDBPerson, Ref: "525"},
		},
	})
	require.NoError(t, err)
	ids := map[string]int{}
	for id, it := range repo.items {
		ids[it.Item.ExternalID] = id
	}
	return svc, job, ids
}

func TestImportService_ImportItems(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &fakeCreator{
		exists: map[string]bool{"https://www.youtube.com/watch?v=b": true},
		fail:   map[string]error{"https://www.youtube.com/watch?v=c": fmt.Errorf("%w: status 403 key=SECRET", domain.ErrYouTubeAPI)},
	}
	svc, job, ids := stageJob(t, repo, creator)
	repo.libraryURLs["https://www.youtube.com/watch?v=in-lib"] = 55
	inLib := candidate("in-lib", domain.ContentTypeYouTubeVideo)
	inLib.Item.JobID, inLib.Item.SourceID = job.ID, job.Sources[0].ID
	require.NoError(t, repo.UpsertItems(context.Background(), []*domain.ImportItemWithDetails{inLib}))
	for id, it := range repo.items {
		ids[it.Item.ExternalID] = id
	}

	res, err := svc.ImportItems(context.Background(), importUser, job.ID,
		[]int{ids["a"], ids["b"], ids["c"], ids["27205"], ids["in-lib"], ids["a"], 99999, -1})
	require.NoError(t, err)
	assert.Equal(t, domain.ImportBatchResult{Queued: 4, AlreadyInLibrary: 1, NotFound: 1}, *res)

	assert.ElementsMatch(t, []string{"https://www.youtube.com/watch?v=a", "https://www.youtube.com/watch?v=b", "https://www.youtube.com/watch?v=c"}, creator.youtube)
	assert.Equal(t, []string{"https://www.themoviedb.org/movie/27205"}, creator.movies, "movie rows go through CreateFromMovie")
	for _, uid := range creator.userIDs {
		assert.Equal(t, importUser.ID, uid, "content is attributed to whoever imported it")
	}

	status := func(ext string) domain.ImportItem { return repo.items[ids[ext]].Item }
	assert.Equal(t, domain.ImportItemStatusImported, *status("a").ImportStatus)
	assert.NotNil(t, status("a").ContentID)
	assert.Equal(t, domain.ImportItemStatusSkipped, *status("b").ImportStatus)
	assert.Equal(t, 900, *status("b").ContentID, "a skipped row links to the existing content")
	assert.Equal(t, domain.ImportItemStatusFailed, *status("c").ImportStatus)
	assert.Equal(t, "The source API refused the request. Try again later.", *status("c").ImportError)
	assert.Nil(t, status("in-lib").ImportStatus, "in-library rows are never queued")

	// A second call: a and b are done, c failed and is retried.
	creator.fail = nil
	res, err = svc.ImportItems(context.Background(), importUser, job.ID, []int{ids["a"], ids["b"], ids["c"]})
	require.NoError(t, err)
	assert.Equal(t, domain.ImportBatchResult{Queued: 1, AlreadyQueued: 2}, *res)
	assert.Equal(t, domain.ImportItemStatusImported, *status("c").ImportStatus)
}

func TestImportService_ImportItemsValidation(t *testing.T) {
	svc := newImportService(newFakeImportRepo(), nil, nil, &fakeCreator{})
	ctx := context.Background()
	_, err := svc.ImportItems(ctx, nil, 1, []int{1})
	assert.ErrorIs(t, err, domain.ErrForbidden)
	_, err = svc.ImportItems(ctx, importUser, 1, []int{0, -3})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	tooMany := make([]int, domain.MaxImportItemsPerRequest+1)
	for i := range tooMany {
		tooMany[i] = i + 1
	}
	_, err = svc.ImportItems(ctx, importUser, 1, tooMany)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestImportService_ImportWorkersStopOnShutdown(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &fakeCreator{}
	bg, cancel := context.WithCancel(context.Background())
	cancel()
	yt := &fakeLister{}
	svc := services.NewImportService(repo, map[domain.ImportSourceType]portservices.ImportSourceLister{domain.ImportSourceYouTubeChannel: yt},
		creator, inline, services.WithImportBackground(bg))
	job, err := svc.CreateImportJob(context.Background(), importAdmin, domain.CreateImportJobInput{
		Name: "x", Sources: []domain.CreateImportSourceInput{{SourceType: domain.ImportSourceYouTubeChannel, Ref: "@x"}},
	})
	require.NoError(t, err)
	c := candidate("a", domain.ContentTypeYouTubeVideo)
	c.Item.JobID, c.Item.SourceID = job.ID, job.Sources[0].ID
	require.NoError(t, repo.UpsertItems(context.Background(), []*domain.ImportItemWithDetails{c}))
	var id int
	for k := range repo.items {
		id = k
	}

	res, err := svc.ImportItems(context.Background(), importUser, job.ID, []int{id})
	require.NoError(t, err)
	assert.Equal(t, 1, res.Queued)
	assert.Empty(t, creator.youtube, "nothing is imported once the server is shutting down")
	assert.Equal(t, domain.ImportItemStatusQueued, *repo.items[id].Item.ImportStatus, "left queued for RecoverInterrupted")
}

func TestImportService_Reads(t *testing.T) {
	repo := newFakeImportRepo()
	svc, job, ids := stageJob(t, repo, &fakeCreator{})
	ctx := context.Background()

	jobs, err := svc.ListImportJobs(ctx)
	require.NoError(t, err)
	assert.Len(t, jobs, 1)

	got, err := svc.GetImportJob(ctx, 424242)
	require.NoError(t, err)
	assert.Nil(t, got, "unknown import is (nil, nil)")
	got, err = svc.GetImportJob(ctx, 0)
	require.NoError(t, err)
	assert.Nil(t, got)

	none, err := svc.ListImportItems(ctx, 0)
	require.NoError(t, err)
	assert.Empty(t, none)
	items, err := svc.ListImportItems(ctx, job.ID)
	require.NoError(t, err)
	assert.Len(t, items, 4)

	d, err := svc.GetImportItemDetails(ctx, ids["a"])
	require.NoError(t, err)
	assert.Equal(t, "a", d.Item.ExternalID)
	d, err = svc.GetImportItemDetails(ctx, 424242)
	require.NoError(t, err)
	assert.Nil(t, d)

	require.NoError(t, svc.RecoverInterrupted(ctx))
}

// reassignRecordingImportRepo records ReassignByUser calls on top of the fake.
type reassignRecordingImportRepo struct {
	*fakeImportRepo
	calls *[]string
	err   error
}

func (r reassignRecordingImportRepo) ReassignByUser(_ context.Context, from, to int) error {
	*r.calls = append(*r.calls, fmt.Sprintf("imports.reassign %d->%d", from, to))
	return r.err
}

func TestDelete_ReassignsImportJobsBeforeDeletingTheUser(t *testing.T) {
	for _, tt := range []struct {
		name    string
		err     error
		wantErr bool
	}{{"success", nil, false}, {"failure stops the delete", errors.New("db down"), true}} {
		t.Run(tt.name, func(t *testing.T) {
			var calls []string
			repo := &mockUserRepository{
				getByIDFn: func(context.Context, int) (*domain.User, error) {
					return &domain.User{ID: 2, Username: "testuser", Role: domain.UserRoleDefault}, nil
				},
				getByUsernameFn: func(context.Context, string) (*domain.User, error) {
					return &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}, nil
				},
				deleteFn: func(context.Context, int) error { calls = append(calls, "user.delete"); return nil },
			}
			imports := reassignRecordingImportRepo{fakeImportRepo: newFakeImportRepo(), calls: &calls, err: tt.err}
			svc := services.NewUserService(repo, &mockContentRepoForUser{}, &mockPerspectiveRepoForUser{},
				&mockUserTodoRepo{}, &mockUserTodoListRepo{}, &mockTodoActionRepo{}, services.WithImportJobRepository(imports))

			err := svc.Delete(context.Background(), testAdmin, 2)
			if tt.wantErr {
				require.Error(t, err)
				assert.Equal(t, []string{"imports.reassign 2->1"}, calls)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, []string{"imports.reassign 2->1", "user.delete"}, calls)
		})
	}
}
