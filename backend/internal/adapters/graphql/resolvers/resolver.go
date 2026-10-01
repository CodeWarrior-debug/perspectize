package resolvers

import (
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// This file serves as dependency injection for your app. It also holds the
// root resolver wiring (the Resolver struct, its constructor, and the
// generated.*Resolver getter methods) so that content.resolvers.go,
// perspective.resolvers.go, user.resolvers.go, and category.resolvers.go
// each contain only the field resolvers for their own domain.
//
// gqlgen recognizes existing implementations by receiver + method signature
// regardless of which file they live in, so this split survives
// `make graphql-gen`: newly added fields land as stubs in schema.resolvers.go
// (there is only one schema.graphql source file) and should be moved into
// the matching domain file above.

type Resolver struct {
	ContentService             portservices.ContentService
	UserService                portservices.UserService
	PerspectiveService         portservices.PerspectiveService
	CategoryService            portservices.CategoryService
	HermeneuticApproachService portservices.HermeneuticApproachService

	// Messaging feature dependencies.
	Messaging portservices.MessagingService
	Hub       *realtime.Hub
	Presence  *realtime.PresenceTracker
}

// NewResolver creates a new resolver with dependencies
func NewResolver(
	contentService portservices.ContentService,
	userService portservices.UserService,
	perspectiveService portservices.PerspectiveService,
	categoryService portservices.CategoryService,
	hermeneuticApproachService portservices.HermeneuticApproachService,
	messagingService portservices.MessagingService,
	hub *realtime.Hub,
	presence *realtime.PresenceTracker,
) *Resolver {
	return &Resolver{
		ContentService:             contentService,
		UserService:                userService,
		PerspectiveService:         perspectiveService,
		CategoryService:            categoryService,
		HermeneuticApproachService: hermeneuticApproachService,
		Messaging:                  messagingService,
		Hub:                        hub,
		Presence:                   presence,
	}
}

// Content returns generated.ContentResolver implementation.
func (r *Resolver) Content() generated.ContentResolver { return &contentResolver{r} }

// Mutation returns generated.MutationResolver implementation.
func (r *Resolver) Mutation() generated.MutationResolver { return &mutationResolver{r} }

// Query returns generated.QueryResolver implementation.
func (r *Resolver) Query() generated.QueryResolver { return &queryResolver{r} }

// User returns generated.UserResolver implementation.
func (r *Resolver) User() generated.UserResolver { return &userResolver{r} }

type contentResolver struct{ *Resolver }
type mutationResolver struct{ *Resolver }
type queryResolver struct{ *Resolver }
type userResolver struct{ *Resolver }
