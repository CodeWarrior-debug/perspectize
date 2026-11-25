package resolvers

import (
	"errors"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
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
