package memdata_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves/datacontract"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves/memdata"
)

func TestContract(t *testing.T) {
	datacontract.Run(t, func(_ *testing.T, rows []datacontract.Row) jeeves.PerspectizeData {
		ps := make([]jeeves.Perspective, len(rows))
		for i, r := range rows {
			ps[i] = jeeves.Perspective{
				ID: r.ID, OwnerID: r.OwnerID, ContentID: r.ContentID, Private: r.Private,
				Quality: r.Quality, Review: r.Review, CreatedAt: r.CreatedAt,
			}
		}
		return memdata.New(ps)
	})
}
