package resolvers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// createFailure is one create mutation's client-facing messages. Each field is
// the message shown for that error kind; an empty field falls back to generic.
// The messages are the ones clients already match on, so they must not change.
type createFailure struct {
	invalid  string
	notFound string
	generic  string
	// logMsg, when set, logs errors that fall back to generic. Use it where the
	// service does not already log the cause.
	logMsg string
	// passthroughInvalid shows an invalid-input error's own message (passage).
	passthroughInvalid bool
	// custom returns a specific message for errors the kinds do not describe
	// (webpage input errors), or "" to fall through to the kind messages.
	custom func(err error) string
}

// createResult maps one create's row and error to its mutation result. A row
// returned with ErrAlreadyExists is a success with alreadyExisted set.
func createResult(content *domain.Content, err error, f createFailure) (*model.CreateContentResult, error) {
	if errors.Is(err, domain.ErrAlreadyExists) && content != nil {
		return &model.CreateContentResult{Content: domainToModel(content), AlreadyExisted: true}, nil
	}
	if err != nil {
		return nil, createError(err, f)
	}
	return &model.CreateContentResult{Content: domainToModel(content), AlreadyExisted: false}, nil
}

// createError maps a create error to a GraphQL error. Typed kinds carry their
// code in extensions; an error with no kind is returned as a plain message.
func createError(err error, f createFailure) error {
	kind := domain.KindOf(err)
	msg := ""
	if f.custom != nil {
		msg = f.custom(err)
	}
	if msg == "" {
		msg = f.generic
		switch kind {
		case domain.KindInvalid:
			if f.passthroughInvalid && errors.Is(err, domain.ErrInvalidInput) {
				msg = err.Error()
			} else if f.invalid != "" {
				msg = f.invalid
			}
		case domain.KindNotFound:
			if f.notFound != "" {
				msg = f.notFound
			}
		case domain.KindNotAllowed:
			msg = domain.ErrContentNotAllowed.Error()
		}
		if kind == domain.KindNone && f.logMsg != "" {
			slog.Error(f.logMsg, "error", err)
		}
	}
	return kindedError(msg, kind)
}

var (
	youtubeCreateFailure = createFailure{
		invalid: "invalid YouTube URL",
		generic: "failed to create content from YouTube",
	}
	webPageCreateFailure = createFailure{
		generic: "failed to save webpage",
		logMsg:  "creating webpage content failed",
		custom:  webPageInputMessage,
	}
	websiteCreateFailure = createFailure{
		generic: "failed to save website",
		logMsg:  "creating website content failed",
		custom:  webPageInputMessage,
	}
	movieCreateFailure = createFailure{
		invalid:  "invalid movie URL: use a TMDB or IMDb movie link",
		notFound: "movie not found",
		generic:  "failed to create content from movie",
	}
	bookCreateFailure = createFailure{
		invalid:  "invalid book URL or ISBN: use an Open Library work link or an ISBN-10/13",
		notFound: "book not found",
		generic:  "failed to create content from book",
	}
	passageCreateFailure = createFailure{
		generic:            "failed to create passage",
		logMsg:             "failed to create passage content",
		passthroughInvalid: true,
	}
)

// dispatchCreateContent runs the one create that in sets. It is the only place
// that maps a CreateContentInput field to its create: the generic mutation and
// every deprecated per-type mutation call it.
func (r *mutationResolver) dispatchCreateContent(ctx context.Context, in model.CreateContentInput) (*model.CreateContentResult, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	// gqlparser checks the one-field rule only for literal values. Variables reach
	// here unchecked, so the count is enforced in the resolver.
	if n := countCreateFields(in); n != 1 {
		return nil, invalidCreateInput(n)
	}

	switch {
	case in.Youtube != nil:
		return r.createYouTube(ctx, *in.Youtube, authUser.ID)
	case in.WebPage != nil:
		return r.createWebPage(ctx, *in.WebPage, authUser.ID)
	case in.Website != nil:
		return r.createWebsite(ctx, *in.Website, authUser.ID)
	case in.Movie != nil:
		return r.createMovie(ctx, *in.Movie, authUser.ID)
	case in.Book != nil:
		return r.createBook(ctx, *in.Book, authUser.ID)
	default:
		return r.createPassage(ctx, *in.Passage, authUser.ID)
	}
}

// countCreateFields returns how many fields of a CreateContentInput are set.
func countCreateFields(in model.CreateContentInput) int {
	n := 0
	for _, set := range []bool{in.Youtube != nil, in.WebPage != nil, in.Website != nil, in.Movie != nil, in.Book != nil, in.Passage != nil} {
		if set {
			n++
		}
	}
	return n
}

// invalidCreateInput is the INVALID_INPUT error for a CreateContentInput that
// does not set exactly one field.
func invalidCreateInput(n int) error {
	return &gqlerror.Error{
		Message:    fmt.Sprintf("set exactly one field of CreateContentInput, got %d", n),
		Extensions: map[string]any{"code": string(domain.KindInvalid)},
	}
}

// createYouTube creates a YouTube video. A client-supplied userId is accepted
// only when it matches the session.
func (r *mutationResolver) createYouTube(ctx context.Context, in model.CreateContentFromYouTubeInput, userID int) (*model.CreateContentResult, error) {
	if in.UserID != 0 && in.UserID != userID {
		return nil, fmt.Errorf("access denied: cannot create content for another user")
	}
	content, err := r.ContentService.CreateFromYouTube(ctx, in.URL, userID)
	return createResult(content, err, youtubeCreateFailure)
}

// createWebPage saves a webpage. The roles are the adder's picks; the service
// stores them in order.
func (r *mutationResolver) createWebPage(ctx context.Context, in model.CreateContentFromWebPageInput, userID int) (*model.CreateContentResult, error) {
	content, err := r.ContentService.CreateFromWebPage(ctx, portservices.CreateWebPageInput{URL: in.URL, Roles: in.WebPageRoles, ParentContentID: in.ParentContentID}, userID)
	return createResult(content, err, webPageCreateFailure)
}

// createWebsite saves a website under its root URL, whatever page link was given.
func (r *mutationResolver) createWebsite(ctx context.Context, in model.CreateContentFromWebsiteInput, userID int) (*model.CreateContentResult, error) {
	content, err := r.ContentService.CreateFromWebsite(ctx, in.URL, userID)
	return createResult(content, err, websiteCreateFailure)
}

// createMovie creates a movie from a TMDB or IMDb URL.
func (r *mutationResolver) createMovie(ctx context.Context, in model.CreateContentFromMovieInput, userID int) (*model.CreateContentResult, error) {
	content, err := r.ContentService.CreateFromMovie(ctx, in.URL, userID)
	return createResult(content, err, movieCreateFailure)
}

// createBook creates a book from an Open Library work URL or an ISBN. The service
// classifies the input, including hyphenated ISBNs.
func (r *mutationResolver) createBook(ctx context.Context, in model.CreateContentFromBookInput, userID int) (*model.CreateContentResult, error) {
	content, err := r.ContentService.CreateFromBook(ctx, in.URL, userID)
	return createResult(content, err, bookCreateFailure)
}

// createPassage finds or creates a Bible passage. A client-supplied userId is
// accepted only when it matches the session.
func (r *mutationResolver) createPassage(ctx context.Context, in model.CreateContentFromPassageInput, userID int) (*model.CreateContentResult, error) {
	if in.UserID != 0 && in.UserID != userID {
		return nil, fmt.Errorf("access denied: cannot create content for another user")
	}
	content, err := r.ContentService.CreateFromPassage(ctx, portservices.CreatePassageInput{
		BookID:       in.BookID,
		StartChapter: in.StartChapter,
		StartVerse:   in.StartVerse,
		EndChapter:   in.EndChapter,
		EndVerse:     in.EndVerse,
		UserID:       userID,
	})
	return createResult(content, err, passageCreateFailure)
}
