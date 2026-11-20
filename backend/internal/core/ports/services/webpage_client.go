package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// WebPageClient reads a webpage's <head> metadata with SSRF protection.
type WebPageClient interface {
	// Fetch reads the page once. The result always carries Fetch.Status (OK,
	// BLOCKED, ERROR, TIMEOUT, NOT_HTML or TOO_LARGE). The error is set only for
	// invalid input or an address the SSRF check refused (domain.ErrInvalidInput).
	Fetch(ctx context.Context, url string) (domain.WebPageMeta, error)
}

// WebPagePreview is the read-only result of ContentService.PreviewWebPage.
type WebPagePreview struct {
	Meta domain.WebPageMeta
	// AlreadyExistsContentID is the ID of the row this URL already saved as, or nil.
	AlreadyExistsContentID *int
}
