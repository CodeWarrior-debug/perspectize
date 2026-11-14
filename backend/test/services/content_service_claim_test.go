package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func claimIntPtr(v int) *int { return &v }

func claimStrPtr(v string) *string { return &v }

// claimFields decodes the CustomFields JSON written for a claim.
func claimFields(t *testing.T, raw json.RawMessage) map[string]string {
	t.Helper()
	var fields map[string]string
	require.NoError(t, json.Unmarshal(raw, &fields))
	return fields
}

// claimResponseMap decodes a claim's response JSON.
func claimResponseMap(t *testing.T, raw json.RawMessage) map[string]interface{} {
	t.Helper()
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &resp))
	return resp
}

func TestCreateClaim_NoParent_IsPublicByDefaultAndOmitsParent(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			t.Fatalf("GetByID must not be called without a parent")
			return nil, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	got, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text:   "  Water boils at 100C at sea level  ",
		UserID: 7,
	})

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, domain.ContentTypeClaim, saved.ContentType)
	assert.Equal(t, domain.PrivacyPublic, saved.Privacy)
	assert.Equal(t, 7, saved.AddedByUserID)
	assert.Equal(t, "Water boils at 100C at sea level", saved.Name)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(saved.Response, &resp))
	assert.Equal(t, "Water boils at 100C at sea level", resp["text"])
	_, hasParent := resp["parentContentId"]
	assert.False(t, hasParent)
}

func TestCreateClaim_WithParent_RecordsParent(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			assert.Equal(t, 3, id)
			return &domain.Content{ID: 3}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A claim about it", UserID: 7, ParentContentID: claimIntPtr(3),
	})

	require.NoError(t, err)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(saved.Response, &resp))
	assert.EqualValues(t, 3, resp["parentContentId"])
	assert.Equal(t, domain.PrivacyPublic, saved.Privacy)
}

func TestCreateClaim_ExplicitPrivate_IsOwnerOnly(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)
	private := domain.PrivacyPrivate

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A private claim", UserID: 7, Privacy: &private,
	})

	require.NoError(t, err)
	assert.Equal(t, domain.PrivacyPrivate, saved.Privacy)
}

func TestCreateClaim_UnknownPrivacy_InvalidAndNeverSaved(t *testing.T) {
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			t.Fatal("repo must not be called for an unknown privacy")
			return nil, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)
	bogus := domain.Privacy("SECRET")

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A claim", UserID: 7, Privacy: &bogus,
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestUpdateClaim_NilPrivacyKeepsStored(t *testing.T) {
	repo := &mockContentRepository{
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			return &domain.Content{ID: id}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Edited claim text", EffectiveDate: claimStrPtr("2026-10-01"),
	})

	require.NoError(t, err)
	assert.Nil(t, repo.updateClaimPrivacy, "nil must reach the repo so the stored privacy is kept")
}

func TestUpdateClaim_ExplicitPrivacyIsPassedThrough(t *testing.T) {
	repo := &mockContentRepository{
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			return &domain.Content{ID: id}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)
	private := domain.PrivacyPrivate

	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Edited claim text", EffectiveDate: claimStrPtr("2026-10-01"), Privacy: &private,
	})

	require.NoError(t, err)
	require.NotNil(t, repo.updateClaimPrivacy)
	assert.Equal(t, domain.PrivacyPrivate, *repo.updateClaimPrivacy)
}

func TestCreateClaim_MissingParent_NotFound(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A claim", UserID: 7, ParentContentID: claimIntPtr(99),
	})

	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestCreateClaim_InvalidInput(t *testing.T) {
	tests := []struct {
		name  string
		input portservices.CreateClaimInput
	}{
		{"empty text", portservices.CreateClaimInput{Text: "   ", UserID: 7}},
		{"no user", portservices.CreateClaimInput{Text: "A claim"}},
		{"non-positive parent", portservices.CreateClaimInput{Text: "A claim", UserID: 7, ParentContentID: claimIntPtr(0)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)
			_, err := svc.CreateClaim(context.Background(), tt.input)
			assert.True(t, errors.Is(err, domain.ErrInvalidInput))
		})
	}
}

// --- Text rules (create) ---

func TestCreateClaim_TextRules(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		wantName string // normalised name; ignored when wantErr
		wantErr  bool
	}{
		{"collapses internal whitespace runs to one space", "Water   boils\t\tat\n100C", "Water boils at 100C", false},
		{"two words is the minimum", "Water boils", "Water boils", false},
		{"one word is rejected", "Water", "", true},
		{"whitespace-only is rejected", "   \n\t  ", "", true},
		{"punctuation-only is rejected", "... !!!", "", true},
		{"exactly 300 characters is accepted", strings.Repeat("a", 149) + " " + strings.Repeat("b", 150), strings.Repeat("a", 149) + " " + strings.Repeat("b", 150), false},
		{"301 characters is rejected", strings.Repeat("a", 150) + " " + strings.Repeat("b", 150), "", true},
		{"length counts runes, not bytes", strings.Repeat("é", 149) + " " + strings.Repeat("é", 150), strings.Repeat("é", 149) + " " + strings.Repeat("é", 150), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *domain.Content
			repo := &mockContentRepository{
				createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
					saved = c
					return c, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{Text: tt.text, UserID: 7})

			if tt.wantErr {
				assert.True(t, errors.Is(err, domain.ErrInvalidInput), "want ErrInvalidInput, got %v", err)
				assert.Nil(t, saved, "rejected text must never reach the repository")
				return
			}
			require.NoError(t, err)
			require.NotNil(t, saved)
			assert.Equal(t, tt.wantName, saved.Name)
			assert.Equal(t, tt.wantName, claimResponseMap(t, saved.Response)["text"])
		})
	}
}

// --- Date rules (create) ---

func TestCreateClaim_EffectiveDateDefaultsToTodayUTC(t *testing.T) {
	cases := map[string]*string{
		"nil":   nil,
		"empty": claimStrPtr(""),
	}
	for name, effective := range cases {
		t.Run(name, func(t *testing.T) {
			var saved *domain.Content
			repo := &mockContentRepository{
				createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
					saved = c
					return c, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			before := time.Now().UTC().Format("2006-01-02")
			_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
				Text: "Rates rose today", UserID: 7, EffectiveDate: effective,
			})
			after := time.Now().UTC().Format("2006-01-02")

			require.NoError(t, err)
			assert.Contains(t, []string{before, after}, claimFields(t, saved.CustomFields)["effectiveDate"])
		})
	}
}

func TestCreateClaim_DateRules(t *testing.T) {
	tests := []struct {
		name          string
		effective     *string
		evaluate      *string
		wantErr       bool
		wantEffective string
		wantEvaluate  *string // nil means the evaluateBy key must be absent
	}{
		{"malformed effective date is rejected", claimStrPtr("2026/10/23"), nil, true, "", nil},
		{"impossible effective date is rejected", claimStrPtr("2026-02-30"), nil, true, "", nil},
		{"malformed evaluate-by date is rejected", claimStrPtr("2026-10-23"), claimStrPtr("10/23/2026"), true, "", nil},
		{"evaluate-by before effective is rejected", claimStrPtr("2026-10-23"), claimStrPtr("2026-10-22"), true, "", nil},
		{"evaluate-by equal to effective is accepted", claimStrPtr("2026-10-23"), claimStrPtr("2026-10-23"), false, "2026-10-23", claimStrPtr("2026-10-23")},
		{"evaluate-by after effective is stored", claimStrPtr("2026-10-23"), claimStrPtr("2026-11-30"), false, "2026-10-23", claimStrPtr("2026-11-30")},
		{"evaluate-by nil is absent from custom fields", claimStrPtr("2026-10-23"), nil, false, "2026-10-23", nil},
		{"evaluate-by empty is treated as unset", claimStrPtr("2026-10-23"), claimStrPtr(""), false, "2026-10-23", nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *domain.Content
			repo := &mockContentRepository{
				createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
					saved = c
					return c, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
				Text: "Rates rose sharply", UserID: 7,
				EffectiveDate: tt.effective, EvaluateBy: tt.evaluate,
			})

			if tt.wantErr {
				assert.True(t, errors.Is(err, domain.ErrInvalidInput), "want ErrInvalidInput, got %v", err)
				assert.Nil(t, saved, "rejected dates must never reach the repository")
				return
			}
			require.NoError(t, err)
			fields := claimFields(t, saved.CustomFields)
			assert.Equal(t, tt.wantEffective, fields["effectiveDate"])
			if tt.wantEvaluate == nil {
				_, present := fields["evaluateBy"]
				assert.False(t, present, "evaluateBy must be absent when unset")
			} else {
				assert.Equal(t, *tt.wantEvaluate, fields["evaluateBy"])
			}
		})
	}
}

func TestCreateClaim_EvaluateBeforeEffective_MessageNamesTheRule(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "Rates rose sharply", UserID: 7,
		EffectiveDate: claimStrPtr("2026-10-23"), EvaluateBy: claimStrPtr("2026-10-01"),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluate-by date cannot be before the effective date")
}

// --- HTML rendering (create) ---

func TestCreateClaim_HTMLIsEscapedAndSanitised(t *testing.T) {
	text := "Ban <script>x</script> now"
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{Text: text, UserID: 7})

	require.NoError(t, err)
	// name and response.text keep the raw text (display-time tokens stay intact).
	assert.Equal(t, text, saved.Name)
	resp := claimResponseMap(t, saved.Response)
	assert.Equal(t, text, resp["text"])
	// html is the escaped text run through the sanitiser: the script is inert text.
	html, ok := resp["html"].(string)
	require.True(t, ok, "response.html must be present")
	assert.NotContains(t, html, "<script")
	assert.Contains(t, html, "&lt;script&gt;")
}

// --- Parent visibility (create) ---

func TestCreateClaim_ParentVisibility(t *testing.T) {
	tests := []struct {
		name    string
		parent  *domain.Content
		wantErr error
	}{
		{
			"private parent owned by another user is not found",
			&domain.Content{ID: 3, Privacy: domain.PrivacyPrivate, AddedByUserID: 99},
			domain.ErrNotFound,
		},
		{
			"own private parent is accepted",
			&domain.Content{ID: 3, Privacy: domain.PrivacyPrivate, AddedByUserID: 7},
			nil,
		},
		{
			"public parent owned by another user is accepted",
			&domain.Content{ID: 3, Privacy: domain.PrivacyPublic, AddedByUserID: 99},
			nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var saved *domain.Content
			repo := &mockContentRepository{
				createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
					saved = c
					return c, nil
				},
				getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
					return tt.parent, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
				Text: "A claim about it", UserID: 7, ParentContentID: claimIntPtr(3),
			})

			if tt.wantErr != nil {
				assert.True(t, errors.Is(err, tt.wantErr), "want %v, got %v", tt.wantErr, err)
				assert.Nil(t, saved, "an invisible parent must not produce a claim")
				return
			}
			require.NoError(t, err)
			assert.EqualValues(t, 3, claimResponseMap(t, saved.Response)["parentContentId"])
		})
	}
}

// --- UpdateClaim ---

func TestUpdateClaim_PassesOwnerScopedWriteToRepo(t *testing.T) {
	var gotID, gotOwner int
	var gotText, gotHTML string
	var gotFields json.RawMessage
	repo := &mockContentRepository{
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			gotID, gotOwner, gotText, gotHTML, gotFields = id, ownerID, text, html, customFields
			return &domain.Content{ID: id, Name: text, AddedByUserID: ownerID}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	got, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID:     5,
		ActorUserID:   7,
		Text:          "  Rates   rose  ",
		EffectiveDate: claimStrPtr("2026-10-01"),
		EvaluateBy:    claimStrPtr("2026-11-01"),
	})

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, 5, got.ID)
	assert.Equal(t, 5, gotID)
	assert.Equal(t, 7, gotOwner)
	assert.Equal(t, "Rates rose", gotText)
	assert.Contains(t, gotHTML, "Rates rose")
	fields := claimFields(t, gotFields)
	assert.Equal(t, "2026-10-01", fields["effectiveDate"])
	assert.Equal(t, "2026-11-01", fields["evaluateBy"])
}

func TestUpdateClaim_NilDatesDefaultEffectiveAndClearEvaluateBy(t *testing.T) {
	var gotFields json.RawMessage
	repo := &mockContentRepository{
		// A legacy claim with no stored dates: an empty effective date falls back to today.
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, AddedByUserID: 7}, nil
		},
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			gotFields = customFields
			return &domain.Content{ID: id}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	before := time.Now().UTC().Format("2006-01-02")
	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Rates rose",
	})
	after := time.Now().UTC().Format("2006-01-02")

	require.NoError(t, err)
	fields := claimFields(t, gotFields)
	assert.Contains(t, []string{before, after}, fields["effectiveDate"])
	_, present := fields["evaluateBy"]
	assert.False(t, present, "nil evaluateBy must be sent as absent so the repo clears it")
}

func TestUpdateClaim_EmptyEffectiveDateKeepsStoredDate(t *testing.T) {
	for name, effectiveIn := range map[string]*string{
		"nil":          nil,
		"empty string": claimStrPtr(""),
	} {
		t.Run(name, func(t *testing.T) {
			var gotFields json.RawMessage
			repo := &mockContentRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
					return &domain.Content{
						ID:            id,
						AddedByUserID: 7,
						CustomFields:  json.RawMessage(`{"effectiveDate":"2026-09-01","evaluateBy":"2026-12-01"}`),
					}, nil
				},
				updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
					gotFields = customFields
					return &domain.Content{ID: id}, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
				ContentID: 5, ActorUserID: 7, Text: "Rates rose", EffectiveDate: effectiveIn,
			})

			require.NoError(t, err)
			fields := claimFields(t, gotFields)
			assert.Equal(t, "2026-09-01", fields["effectiveDate"])
		})
	}
}

func TestUpdateClaim_ExplicitEffectiveDateReplacesStoredDate(t *testing.T) {
	var gotFields json.RawMessage
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, AddedByUserID: 7, CustomFields: json.RawMessage(`{"effectiveDate":"2026-09-01"}`)}, nil
		},
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			gotFields = customFields
			return &domain.Content{ID: id}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Rates rose", EffectiveDate: claimStrPtr("2026-10-01"),
	})

	require.NoError(t, err)
	assert.Equal(t, "2026-10-01", claimFields(t, gotFields)["effectiveDate"])
}

func TestUpdateClaim_EmptyEffectiveDateOnMissingClaimIsNotFound(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			t.Fatal("repo write must not run for a missing claim")
			return nil, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Rates rose",
	})

	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestUpdateClaim_NonOwnerSurfacesAsNotFound(t *testing.T) {
	repo := &mockContentRepository{
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	got, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 8, Text: "Rates rose",
	})

	assert.Nil(t, got)
	assert.True(t, errors.Is(err, domain.ErrNotFound), "want ErrNotFound, got %v", err)
}

func TestUpdateClaim_RepositoryErrorIsWrapped(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, AddedByUserID: 7}, nil
		},
		updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
			return nil, errors.New("db down")
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	_, err := svc.UpdateClaim(context.Background(), portservices.UpdateClaimInput{
		ContentID: 5, ActorUserID: 7, Text: "Rates rose",
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "db down")
}

func TestUpdateClaim_InvalidInputNeverReachesRepo(t *testing.T) {
	tests := []struct {
		name  string
		input portservices.UpdateClaimInput
	}{
		{"zero content id", portservices.UpdateClaimInput{ContentID: 0, ActorUserID: 7, Text: "Rates rose"}},
		{"negative content id", portservices.UpdateClaimInput{ContentID: -1, ActorUserID: 7, Text: "Rates rose"}},
		{"zero actor", portservices.UpdateClaimInput{ContentID: 5, ActorUserID: 0, Text: "Rates rose"}},
		{"one word", portservices.UpdateClaimInput{ContentID: 5, ActorUserID: 7, Text: "Rates"}},
		{"punctuation only", portservices.UpdateClaimInput{ContentID: 5, ActorUserID: 7, Text: "... !!!"}},
		{"too long", portservices.UpdateClaimInput{ContentID: 5, ActorUserID: 7, Text: strings.Repeat("a", 150) + " " + strings.Repeat("b", 150)}},
		{"bad effective date", portservices.UpdateClaimInput{ContentID: 5, ActorUserID: 7, Text: "Rates rose", EffectiveDate: claimStrPtr("23/10/2026")}},
		{"evaluate-by before effective", portservices.UpdateClaimInput{
			ContentID: 5, ActorUserID: 7, Text: "Rates rose",
			EffectiveDate: claimStrPtr("2026-10-23"), EvaluateBy: claimStrPtr("2026-10-22"),
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			called := false
			repo := &mockContentRepository{
				updateClaimFn: func(ctx context.Context, id, ownerID int, text, html string, customFields json.RawMessage) (*domain.Content, error) {
					called = true
					return nil, nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			_, err := svc.UpdateClaim(context.Background(), tt.input)

			assert.True(t, errors.Is(err, domain.ErrInvalidInput), "want ErrInvalidInput, got %v", err)
			assert.False(t, called, "invalid input must not reach the repository")
		})
	}
}
