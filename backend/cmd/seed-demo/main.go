// Command seed-demo writes the demo-mode dataset (internal/demo) — personas,
// YouTube content, perspectives and a direct-message thread — into the
// database at DATABASE_URL.
//
// It is idempotent: every row is looked up before it is inserted, so re-running
// it against a persistent demo volume only fills gaps. -reset first deletes
// every row owned by (or shared with) a demo persona and then re-seeds, which
// is what tours/E2E runs use to start from a known state; data belonging to
// non-demo users is left alone.
//
// Safety: it refuses any host other than a local/compose one unless
// -allow-remote is passed, so it cannot be pointed at the shared dev database
// by an inherited DATABASE_URL.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// localHosts are the database hosts seed-demo writes to without -allow-remote.
// "postgres" is the service name in docker-compose.demo.yml.
var localHosts = map[string]bool{"localhost": true, "127.0.0.1": true, "::1": true, "postgres": true, "demo-postgres": true}

func main() {
	allowRemote := flag.Bool("allow-remote", false, "permit a non-local DATABASE_URL host (e.g. a dedicated hosted demo database)")
	reset := flag.Bool("reset", false, "delete all demo-persona data before seeding")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if err := checkHost(dsn, *allowRemote); err != nil {
		log.Fatal(err)
	}

	db, err := gorm.Open(gormpg.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		log.Fatalf("connect: %v", err)
	}

	s := &seeder{
		db:           db,
		users:        postgres.NewGormUserRepository(db),
		content:      postgres.NewGormContentRepository(db),
		perspectives: postgres.NewGormPerspectiveRepository(db),
		threads:      postgres.NewGormThreadRepository(db),
		messages:     postgres.NewGormMessageRepository(db),
		userIDs:      map[string]int{},
		contentIDs:   map[string]int{},
	}
	if *reset {
		if err := resetDemoData(context.Background(), db); err != nil {
			log.Fatalf("seed-demo -reset: %v", err)
		}
		fmt.Println("seed-demo: removed existing demo-persona data")
	}
	if err := s.run(context.Background()); err != nil {
		log.Fatalf("seed-demo: %v", err)
	}
	fmt.Println(s.summary())
}

// checkHost rejects non-local database hosts unless explicitly allowed.
func checkHost(dsn string, allowRemote bool) error {
	host := dsnHost(dsn)
	if allowRemote || localHosts[host] {
		return nil
	}
	return fmt.Errorf("refusing to seed demo data into non-local host %q (pass -allow-remote for a dedicated demo database)", host)
}

// dsnHost extracts the host from a URL-style or key=value DSN.
func dsnHost(dsn string) string {
	if u, err := url.Parse(dsn); err == nil && u.Host != "" {
		return u.Hostname()
	}
	for _, field := range strings.Fields(dsn) {
		if v, ok := strings.CutPrefix(field, "host="); ok {
			return v
		}
	}
	return ""
}

// resetDemoData deletes demo personas and everything that references them, in
// FK order, in one transaction. Threads cascade to their participants,
// messages and sequences; content a persona added takes every perspective on
// it along, since perspectives.content_id has no ON DELETE action.
func resetDemoData(ctx context.Context, db *gorm.DB) error {
	// Escape "_" (a LIKE wildcard) so only the literal "demo_" prefix matches.
	demoUsers := `SELECT id FROM users WHERE clerk_user_id LIKE '` + strings.ReplaceAll(demo.ClerkIDPrefix, "_", `\_`) + `%'`
	statements := []string{
		"DELETE FROM message_threads WHERE id IN (SELECT thread_id FROM thread_participants WHERE user_id IN (" + demoUsers + "))",
		"DELETE FROM perspectives WHERE user_id IN (" + demoUsers + ") OR content_id IN (SELECT id FROM content WHERE added_by_user_id IN (" + demoUsers + "))",
		"DELETE FROM content WHERE added_by_user_id IN (" + demoUsers + ")",
		"DELETE FROM users WHERE id IN (" + demoUsers + ")",
	}
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, stmt := range statements {
			if err := tx.Exec(stmt).Error; err != nil {
				return fmt.Errorf("%s: %w", stmt, err)
			}
		}
		return nil
	})
}

type seeder struct {
	db           *gorm.DB
	users        *postgres.GormUserRepository
	content      *postgres.GormContentRepository
	perspectives *postgres.GormPerspectiveRepository
	threads      *postgres.GormThreadRepository
	messages     *postgres.GormMessageRepository

	userIDs    map[string]int // persona key -> users.id
	contentIDs map[string]int // video ID -> content.id
	created    [4]int         // users, content, perspectives, messages
}

func (s *seeder) run(ctx context.Context) error {
	if err := s.seedUsers(ctx); err != nil {
		return err
	}
	if err := s.seedContent(ctx); err != nil {
		return err
	}
	if err := s.seedPerspectives(ctx); err != nil {
		return err
	}
	return s.seedMessages(ctx)
}

func (s *seeder) summary() string {
	return fmt.Sprintf("seed-demo: created %d users, %d content, %d perspectives, %d messages (existing rows left untouched)",
		s.created[0], s.created[1], s.created[2], s.created[3])
}

func (s *seeder) seedUsers(ctx context.Context) error {
	for _, p := range demo.Personas {
		clerkID := demo.ClerkIDFor(p.Key)
		u, err := s.users.GetByClerkID(ctx, clerkID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("lookup persona %s: %w", p.Key, err)
		}
		if u == nil {
			onboarding := domain.DefaultUserOnboarding()
			if !p.FreshOnboarding {
				done := "2026-01-01T00:00:00Z"
				onboarding = domain.UserOnboarding{Version: domain.CurrentIntroVersion, CompletedAt: &done}
			}
			u, err = s.users.Create(ctx, &domain.User{
				ClerkUserID: clerkID,
				Username:    p.Username,
				Email:       p.Email,
				Role:        p.Role,
				Active:      true,
				Onboarding:  onboarding,
			})
			if err != nil {
				return fmt.Errorf("create persona %s: %w", p.Key, err)
			}
			s.created[0]++
		}
		s.userIDs[p.Key] = u.ID
	}
	return nil
}

func (s *seeder) seedContent(ctx context.Context) error {
	for _, v := range demo.Videos {
		if v.AddedBy == "" {
			continue // left for tours to add through the UI
		}
		watchURL := demo.WatchURL(v.ID)
		c, err := s.content.GetByURL(ctx, watchURL)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("lookup video %s: %w", v.ID, err)
		}
		if c == nil {
			meta, err := youtube.FixtureMetadata(v)
			if err != nil {
				return err
			}
			units := "seconds"
			c, err = s.content.Create(ctx, &domain.Content{
				Name:          meta.Title,
				URL:           &watchURL,
				ContentType:   domain.ContentTypeYouTube,
				AddedByUserID: s.userIDs[v.AddedBy],
				Length:        &meta.Duration,
				LengthUnits:   &units,
				Response:      meta.Response,
			})
			if err != nil {
				return fmt.Errorf("create video %s: %w", v.ID, err)
			}
			s.created[1]++
		}
		s.contentIDs[v.ID] = c.ID
	}
	return nil
}

func (s *seeder) seedPerspectives(ctx context.Context) error {
	for _, sp := range demo.Perspectives {
		userID, contentID := s.userIDs[sp.Persona], s.contentIDs[sp.VideoID]
		if userID == 0 || contentID == 0 {
			return fmt.Errorf("perspective references unknown persona %q or video %q", sp.Persona, sp.VideoID)
		}
		var n int64
		if err := s.db.WithContext(ctx).Table("perspectives").
			Where("user_id = ? AND content_id = ?", userID, contentID).Count(&n).Error; err != nil {
			return fmt.Errorf("count perspectives: %w", err)
		}
		if n > 0 {
			continue
		}
		p := &domain.Perspective{
			UserID:     userID,
			ContentID:  &contentID,
			Quality:    intPtr(sp.Quality),
			Agreement:  intPtr(sp.Agreement),
			Importance: intPtr(sp.Importance),
			Confidence: intPtr(sp.Confidence),
			Privacy:    sp.Privacy,
			Labels:     sp.Labels,
			Feelings:   sp.Feelings,
		}
		if sp.Like != "" {
			p.Like = &sp.Like
		}
		if sp.Review != "" {
			p.Review = &sp.Review
		}
		if _, err := s.perspectives.Create(ctx, p); err != nil {
			return fmt.Errorf("create perspective %s/%s: %w", sp.Persona, sp.VideoID, err)
		}
		s.created[2]++
	}
	return nil
}

func (s *seeder) seedMessages(ctx context.Context) error {
	alice, ben := s.userIDs["alice"], s.userIDs["ben"]
	thread, err := s.threads.FindDirectThread(ctx, alice, ben)
	if errors.Is(err, domain.ErrNotFound) {
		title := demo.ThreadTitle
		thread, err = s.threads.CreateThread(ctx, alice, &title, []int{alice, ben})
	}
	if err != nil {
		return fmt.Errorf("demo thread: %w", err)
	}
	before, err := s.messages.MaxSeq(ctx, thread.ID)
	if err != nil {
		return fmt.Errorf("message seq: %w", err)
	}
	for i, m := range demo.Messages {
		// The (thread, sender, client_nonce) unique key makes re-inserts no-ops.
		if _, err := s.messages.Insert(ctx, &domain.Message{
			ThreadID:    thread.ID,
			SenderID:    s.userIDs[m.From],
			Body:        m.Body,
			ClientNonce: fmt.Sprintf("seed-demo-%d", i),
		}); err != nil {
			return fmt.Errorf("message %d: %w", i, err)
		}
	}
	after, err := s.messages.MaxSeq(ctx, thread.ID)
	if err != nil {
		return fmt.Errorf("message seq: %w", err)
	}
	s.created[3] += int(after - before)
	return nil
}

func intPtr(v int) *int { return &v }
