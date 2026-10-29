package postgres

// Integration tests for the import staging repository against a real Postgres.
// Same guard as the user todo integration tests: they run only against the
// LOCAL throwaway testdb (see openLocalUserTodoTestDB) and skip otherwise.
//
//	DATABASE_URL="postgres://postgres:postgres@localhost:5432/testdb?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run ImportJobIntegration -v

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type importJobFixture struct {
	db    *gorm.DB
	repo  *GormImportJobRepository
	admin int
	other int
	salt  int64
}

func newImportJobFixture(t *testing.T) *importJobFixture {
	t.Helper()
	db := openLocalUserTodoTestDB(t)
	salt := time.Now().UnixNano()
	mkUser := func(label string) int {
		var id int
		require.NoError(t, db.Raw("INSERT INTO users (username) VALUES (?) RETURNING id",
			fmt.Sprintf("ij-%s-%06x", label, salt&0xFFFFFF)).Scan(&id).Error)
		return id
	}
	f := &importJobFixture{db: db, repo: NewGormImportJobRepository(db), admin: mkUser("a"), other: mkUser("b"), salt: salt}
	t.Cleanup(func() {
		ids := []int{f.admin, f.other}
		db.Exec("DELETE FROM import_jobs WHERE user_id IN ?", ids)
		db.Exec("DELETE FROM content WHERE added_by_user_id IN ?", ids)
		db.Exec("DELETE FROM users WHERE id IN ?", ids)
	})
	return f
}

// newJob creates a job with one YouTube channel source and one TMDB person source.
func (f *importJobFixture) newJob(t *testing.T) *domain.ImportJob {
	t.Helper()
	director := domain.ImportPersonRoleDirector
	job, err := f.repo.CreateJob(context.Background(), &domain.ImportJob{
		UserID: f.admin,
		Name:   "Peterson and Nolan",
		Sources: []*domain.ImportSource{
			{SourceType: domain.ImportSourceYouTubeChannel, SourceRef: "@JordanBPeterson", DestinationType: domain.ContentTypeYouTubeVideo},
			{SourceType: domain.ImportSourceTMDBPerson, SourceRef: "525", Role: &director, DestinationType: domain.ContentTypeMovie},
		},
	})
	require.NoError(t, err)
	return job
}

func (f *importJobFixture) videoItem(job *domain.ImportJob, n int) *domain.ImportItemWithDetails {
	id := fmt.Sprintf("v%x-%d", f.salt&0xFFFF, n)
	likes := int64(100 * n)
	views := int64(1000 * n)
	dur := 60 * n
	summary := fmt.Sprintf("Summary %d", n)
	pub := time.Date(2026, 10, n, 0, 0, 0, 0, time.UTC)
	return &domain.ImportItemWithDetails{
		Item: domain.ImportItem{
			JobID: job.ID, SourceID: job.Sources[0].ID, ExternalID: id,
			DestinationType: domain.ContentTypeYouTubeVideo,
			CanonicalURL:    "https://www.youtube.com/watch?v=" + id,
			Kind:            domain.ImportItemKindVideo, Title: fmt.Sprintf("Video %d", n), Summary: &summary,
			PublishedAt: &pub, DurationSeconds: &dur, ViewCount: &views, LikeCount: &likes,
			Position: n, StatsFetchedAt: time.Now().UTC(),
		},
		Details: domain.ImportItemDetails{
			Description: fmt.Sprintf("Full description %d", n),
			Tags:        []string{"psychology"},
			Chapters:    []domain.ImportChapter{{StartSeconds: 0, Title: "Intro"}},
		},
	}
}

func TestImportJobIntegration_CreateGetAndList(t *testing.T) {
	f := newImportJobFixture(t)
	ctx := context.Background()

	c := querycount.Attach(t, f.db)
	job := f.newJob(t)
	c.AssertExactly(t, 2) // job insert + one multi-row source insert

	require.Len(t, job.Sources, 2)
	assert.Equal(t, domain.ImportSourceStatusListing, job.Sources[0].Status)
	assert.Equal(t, domain.ContentTypeMovie, job.Sources[1].DestinationType)
	require.NotNil(t, job.Sources[1].Role)
	assert.Equal(t, domain.ImportPersonRoleDirector, *job.Sources[1].Role)

	c.Reset()
	got, err := f.repo.GetJob(ctx, job.ID)
	require.NoError(t, err)
	c.AssertExactly(t, 2)
	assert.Equal(t, "Peterson and Nolan", got.Name)
	assert.Len(t, got.Sources, 2)

	f.newJob(t)
	c.Reset()
	jobs, err := f.repo.ListJobs(ctx)
	require.NoError(t, err)
	c.AssertExactly(t, 2) // jobs + all their sources, whatever the number of jobs
	mine := 0
	for _, j := range jobs {
		if j.UserID == f.admin {
			mine++
			assert.Len(t, j.Sources, 2)
		}
	}
	assert.Equal(t, 2, mine)

	_, err = f.repo.GetJob(ctx, -1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestImportJobIntegration_CreateJobUnknownUser(t *testing.T) {
	f := newImportJobFixture(t)
	_, err := f.repo.CreateJob(context.Background(), &domain.ImportJob{UserID: -5, Name: "x"})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestImportJobIntegration_UpsertListAndInLibrary(t *testing.T) {
	f := newImportJobFixture(t)
	ctx := context.Background()
	job := f.newJob(t)

	batch := []*domain.ImportItemWithDetails{f.videoItem(job, 1), f.videoItem(job, 2), f.videoItem(job, 3)}
	batch[2].Item.Genres = []string{"Science fiction", "Thriller"}
	batch[2].Item.TopCast = []string{"Leonardo DiCaprio", "Ken Watanabe"}
	pop, reviews, revenue, budget := 38.5, 12, int64(836848102), int64(160000000)
	batch[2].Item.Popularity, batch[2].Item.ReviewCount, batch[2].Item.Revenue, batch[2].Item.Budget = &pop, &reviews, &revenue, &budget
	c := querycount.Attach(t, f.db)
	require.NoError(t, f.repo.UpsertItems(ctx, batch))
	c.AssertExactly(t, 1)
	c.Reset()
	require.NoError(t, f.repo.UpsertItems(ctx, nil))
	c.AssertExactly(t, 0)

	// Video 2 is already in the library (added by hand, not by this import).
	var contentID int
	require.NoError(t, f.db.Raw("INSERT INTO content (name, url, content_type, added_by_user_id) VALUES (?, ?, 'youtube_video', ?) RETURNING id",
		"Video 2", batch[1].Item.CanonicalURL, f.other).Scan(&contentID).Error)

	c.Reset()
	items, err := f.repo.ListItems(ctx, job.ID)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
	require.Len(t, items, 3)
	assert.Equal(t, "Video 1", items[0].Title)
	assert.False(t, items[0].InLibrary)
	assert.Nil(t, items[0].ContentID)
	assert.True(t, items[1].InLibrary)
	require.NotNil(t, items[1].ContentID)
	assert.Equal(t, contentID, *items[1].ContentID)
	assert.Equal(t, domain.ImportItemKindVideo, items[2].Kind)
	assert.Equal(t, int64(300), *items[2].LikeCount)
	assert.Equal(t, []string{"Science fiction", "Thriller"}, items[2].Genres)
	assert.Equal(t, []string{"Leonardo DiCaprio", "Ken Watanabe"}, items[2].TopCast)
	assert.InDelta(t, 38.5, *items[2].Popularity, 0.001)
	assert.Equal(t, 12, *items[2].ReviewCount)
	assert.Equal(t, revenue, *items[2].Revenue)
	assert.Equal(t, budget, *items[2].Budget)
	assert.Nil(t, items[0].Revenue)
	assert.Equal(t, []string{}, items[0].Genres, "no genres reads back as an empty list, not nil")
	assert.Equal(t, []string{}, items[0].TopCast)

	// Re-staging refreshes stats but keeps the import outcome.
	require.NoError(t, f.repo.RecordOutcome(ctx, items[0].ID, domain.ImportItemStatusFailed, ptr("quota"), nil))
	again := f.videoItem(job, 1)
	newViews := int64(999999)
	again.Item.ViewCount = &newViews
	require.NoError(t, f.repo.UpsertItems(ctx, []*domain.ImportItemWithDetails{again}))
	items, err = f.repo.ListItems(ctx, job.ID)
	require.NoError(t, err)
	require.Len(t, items, 3)
	assert.Equal(t, newViews, *items[0].ViewCount)
	require.NotNil(t, items[0].ImportStatus)
	assert.Equal(t, domain.ImportItemStatusFailed, *items[0].ImportStatus)

	c.Reset()
	d, err := f.repo.GetItemWithDetails(ctx, items[0].ID)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
	assert.Equal(t, "Full description 1", d.Details.Description)
	assert.Equal(t, []string{"psychology"}, d.Details.Tags)
	require.Len(t, d.Details.Chapters, 1)

	_, err = f.repo.GetItemWithDetails(ctx, -1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestImportJobIntegration_QueueAndOutcomes(t *testing.T) {
	f := newImportJobFixture(t)
	ctx := context.Background()
	job := f.newJob(t)
	other := f.newJob(t)
	require.NoError(t, f.repo.UpsertItems(ctx, []*domain.ImportItemWithDetails{f.videoItem(job, 1), f.videoItem(job, 2), f.videoItem(job, 3)}))
	require.NoError(t, f.repo.UpsertItems(ctx, []*domain.ImportItemWithDetails{f.videoItem(other, 4)}))
	items, err := f.repo.ListItems(ctx, job.ID)
	require.NoError(t, err)
	otherItems, err := f.repo.ListItems(ctx, other.ID)
	require.NoError(t, err)
	ids := []int{items[0].ID, items[1].ID, items[2].ID, otherItems[0].ID}

	c := querycount.Attach(t, f.db)
	got, err := f.repo.GetItemsByIDs(ctx, job.ID, ids)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
	assert.Len(t, got, 3, "the other job's row is excluded")
	c.Reset()
	none, err := f.repo.GetItemsByIDs(ctx, job.ID, nil)
	require.NoError(t, err)
	assert.Empty(t, none)
	c.AssertExactly(t, 0)

	require.NoError(t, f.repo.RecordOutcome(ctx, items[2].ID, domain.ImportItemStatusImported, nil, nil))

	c.Reset()
	queued, err := f.repo.MarkQueued(ctx, job.ID, ids)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
	assert.ElementsMatch(t, []int{items[0].ID, items[1].ID}, queued, "imported rows and other jobs' rows are not queued")

	again, err := f.repo.MarkQueued(ctx, job.ID, ids)
	require.NoError(t, err)
	assert.Empty(t, again, "already-queued rows are not queued twice")

	var contentID int
	require.NoError(t, f.db.Raw("INSERT INTO content (name, url, content_type, added_by_user_id) VALUES ('V1', ?, 'youtube_video', ?) RETURNING id",
		items[0].CanonicalURL, f.admin).Scan(&contentID).Error)
	c.Reset()
	require.NoError(t, f.repo.RecordOutcome(ctx, items[0].ID, domain.ImportItemStatusImported, nil, &contentID))
	c.AssertExactly(t, 1)

	listed, err := f.repo.ListItems(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportItemStatusImported, *listed[0].ImportStatus)
	assert.Equal(t, contentID, *listed[0].ContentID)
	assert.NotNil(t, listed[0].ImportedAt)
	assert.Equal(t, domain.ImportItemStatusQueued, *listed[1].ImportStatus)

	// A restart fails what was left in flight: the source still listing and row 2 still queued.
	c.Reset()
	srcN, itemN, err := f.repo.FailInterrupted(ctx, "interrupted by a restart")
	require.NoError(t, err)
	c.AssertExactly(t, 2)
	assert.GreaterOrEqual(t, srcN, 2)
	assert.GreaterOrEqual(t, itemN, 1)
	listed, err = f.repo.ListItems(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportItemStatusFailed, *listed[1].ImportStatus)
	require.NotNil(t, listed[1].ImportError)

	// Failed rows can be queued again.
	requeued, err := f.repo.MarkQueued(ctx, job.ID, []int{items[1].ID})
	require.NoError(t, err)
	assert.Equal(t, []int{items[1].ID}, requeued)
}

func TestImportJobIntegration_UpdateSourceAndReassign(t *testing.T) {
	f := newImportJobFixture(t)
	ctx := context.Background()
	job := f.newJob(t)

	now := time.Now().UTC()
	count := 42
	c := querycount.Attach(t, f.db)
	require.NoError(t, f.repo.UpdateSource(ctx, job.Sources[0].ID, repositories.ImportSourceUpdate{
		Status: domain.ImportSourceStatusReady, Title: ptr("Jordan B Peterson"), URL: ptr("https://www.youtube.com/@JordanBPeterson"),
		ItemCount: &count, FetchedAt: &now,
	}))
	c.AssertExactly(t, 1)
	got, err := f.repo.GetJob(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportSourceStatusReady, got.Sources[0].Status)
	assert.Equal(t, 42, got.Sources[0].ItemCount)
	assert.Equal(t, "Jordan B Peterson", *got.Sources[0].Title)

	err = f.repo.UpdateSource(ctx, -1, repositories.ImportSourceUpdate{Status: domain.ImportSourceStatusFailed})
	assert.ErrorIs(t, err, domain.ErrNotFound)

	require.NoError(t, f.repo.ReassignByUser(ctx, f.admin, f.other))
	got, err = f.repo.GetJob(ctx, job.ID)
	require.NoError(t, err)
	assert.Equal(t, f.other, got.UserID)
}

func ptr[T any](v T) *T { return &v }

func TestImportJobIntegration_RequestsAndReview(t *testing.T) {
	f := newImportJobFixture(t)
	ctx := context.Background()
	request := func() *domain.ImportJob {
		job, err := f.repo.CreateJob(ctx, &domain.ImportJob{
			UserID: f.other, Name: "Gaither", RequestStatus: domain.ImportRequestStatusRequested,
			Sources: []*domain.ImportSource{{SourceType: domain.ImportSourceYouTubeChannel, SourceRef: "@GaitherMusic",
				DestinationType: domain.ContentTypeYouTubeVideo, Status: domain.ImportSourceStatusWaiting}},
		})
		require.NoError(t, err)
		return job
	}
	first, second := request(), request()
	assert.Equal(t, domain.ImportRequestStatusRequested, first.RequestStatus)
	assert.Equal(t, domain.ImportSourceStatusWaiting, first.Sources[0].Status)
	assert.Equal(t, domain.ImportRequestStatusApproved, f.newJob(t).RequestStatus, "an unset status is stored as approved")

	c := querycount.Attach(t, f.db)
	n, err := f.repo.CountPendingRequests(ctx, f.other)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
	assert.Equal(t, 2, n)

	at := time.Now().UTC().Truncate(time.Second)
	c.Reset()
	require.NoError(t, f.repo.ReviewJob(ctx, first.ID, domain.ImportRequestStatusApproved, nil, at))
	c.AssertExactly(t, 2) // the job, then its waiting sources
	got, err := f.repo.GetJob(ctx, first.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportRequestStatusApproved, got.RequestStatus)
	require.NotNil(t, got.ReviewedAt)
	assert.True(t, at.Equal(*got.ReviewedAt))
	assert.Equal(t, domain.ImportSourceStatusListing, got.Sources[0].Status)

	// A second review of the same request loses: it isn't requested any more.
	err = f.repo.ReviewJob(ctx, first.ID, domain.ImportRequestStatusDeclined, ptr("late"), at)
	assert.ErrorIs(t, err, domain.ErrNotFound)

	c.Reset()
	require.NoError(t, f.repo.ReviewJob(ctx, second.ID, domain.ImportRequestStatusDeclined, ptr("Already imported"), at))
	c.AssertExactly(t, 1) // a decline leaves the sources alone
	got, err = f.repo.GetJob(ctx, second.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.ImportRequestStatusDeclined, got.RequestStatus)
	assert.Equal(t, "Already imported", *got.ReviewNote)
	assert.Equal(t, domain.ImportSourceStatusWaiting, got.Sources[0].Status)

	n, err = f.repo.CountPendingRequests(ctx, f.other)
	require.NoError(t, err)
	assert.Equal(t, 0, n)
}
