package services

import (
	"context"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// HermeneuticApproachService implements business logic for hermeneutic approach reads
type HermeneuticApproachService struct {
	repo repositories.HermeneuticApproachRepository
}

// NewHermeneuticApproachService creates a new hermeneutic approach service
func NewHermeneuticApproachService(repo repositories.HermeneuticApproachRepository) *HermeneuticApproachService {
	return &HermeneuticApproachService{repo: repo}
}

// ListAll returns every hermeneutic approach, ordered for display.
func (s *HermeneuticApproachService) ListAll(ctx context.Context) ([]*domain.HermeneuticApproach, error) {
	approaches, err := s.repo.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list hermeneutic approaches: %w", err)
	}
	return approaches, nil
}
