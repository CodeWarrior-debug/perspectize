// Package datacontract is the shared contract every jeeves.PerspectizeData
// implementation must pass (TOOLS-03). The core promise: no viewer ever gets
// another user's private perspective, whatever the query. The backend
// adapter and memdata both run it, so a new implementation can't quietly
// skip the privacy rule.
package datacontract

import (
	"context"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
)

// Row is one seeded perspective. OwnerID 1 and 2 are the two test users.
type Row struct {
	ID        int
	OwnerID   int
	ContentID int
	Private   bool
	Quality   *float64
	Review    string
	CreatedAt time.Time
}

// Contents are the content IDs the seed uses.
var Contents = []int{10, 20}

// Seed returns the fixture: both users have a public and a private
// perspective on each content, so every query shape has something to leak.
func Seed() []Row {
	base := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	var rows []Row
	id := 1
	for _, c := range Contents {
		for _, owner := range []int{1, 2} {
			for _, private := range []bool{false, true} {
				q := float64(id)
				rows = append(rows, Row{
					ID:        id,
					OwnerID:   owner,
					ContentID: c,
					Private:   private,
					Quality:   &q,
					Review:    "review by user",
					CreatedAt: base.Add(time.Duration(id) * time.Hour),
				})
				id++
			}
		}
	}
	return rows
}

// Factory builds the implementation under test, loaded with rows.
type Factory func(t *testing.T, rows []Row) jeeves.PerspectizeData

// Run checks an implementation against the contract.
func Run(t *testing.T, newData Factory) {
	t.Helper()
	rows := Seed()
	data := newData(t, rows)
	ctx := context.Background()
	viewers := []jeeves.Viewer{{}, {UserID: 1}, {UserID: 2}}

	visible := func(v jeeves.Viewer, r Row) bool { return !r.Private || r.OwnerID == v.UserID }

	for _, v := range viewers {
		// Every query shape, including Mine for an anonymous viewer, which
		// the tool never sends but an implementation must still handle safely.
		queries := []jeeves.PerspectiveQuery{{Mine: true, Limit: jeeves.MaxPerspectives}}
		for _, c := range Contents {
			queries = append(queries, jeeves.PerspectiveQuery{ContentID: c, Limit: jeeves.MaxPerspectives})
		}
		for _, q := range queries {
			got, err := data.ListPerspectives(ctx, v, q)
			if err != nil {
				t.Fatalf("viewer %d, query %+v: %v", v.UserID, q, err)
			}
			byID := map[int]Row{}
			for _, r := range rows {
				byID[r.ID] = r
			}
			gotIDs := map[int]bool{}
			for _, p := range got {
				r, ok := byID[p.ID]
				if !ok {
					t.Fatalf("viewer %d, query %+v: returned unknown perspective %d", v.UserID, q, p.ID)
				}
				gotIDs[p.ID] = true
				if !visible(v, r) {
					t.Errorf("PRIVACY: viewer %d, query %+v: got user %d's private perspective %d", v.UserID, q, r.OwnerID, r.ID)
				}
				if p.OwnerID != r.OwnerID || p.Private != r.Private || p.ContentID != r.ContentID {
					t.Errorf("viewer %d: perspective %d fields = owner %d private %v content %d, want %d %v %d",
						v.UserID, p.ID, p.OwnerID, p.Private, p.ContentID, r.OwnerID, r.Private, r.ContentID)
				}
				if p.Mine != (!v.Anonymous() && r.OwnerID == v.UserID) {
					t.Errorf("viewer %d: perspective %d Mine = %v", v.UserID, p.ID, p.Mine)
				}
			}
			// Completeness: exactly the rows the query should see.
			for _, r := range rows {
				want := false
				if q.Mine {
					want = !v.Anonymous() && r.OwnerID == v.UserID
				} else {
					want = r.ContentID == q.ContentID && visible(v, r)
				}
				if want != gotIDs[r.ID] {
					t.Errorf("viewer %d, query %+v: perspective %d returned = %v, want %v", v.UserID, q, r.ID, gotIDs[r.ID], want)
				}
			}
		}
	}

	t.Run("limit is respected", func(t *testing.T) {
		got, err := data.ListPerspectives(ctx, jeeves.Viewer{UserID: 1}, jeeves.PerspectiveQuery{ContentID: Contents[0], Limit: 1})
		if err != nil {
			t.Fatal(err)
		}
		if len(got) != 1 {
			t.Errorf("limit 1 returned %d perspectives", len(got))
		}
	})
}
