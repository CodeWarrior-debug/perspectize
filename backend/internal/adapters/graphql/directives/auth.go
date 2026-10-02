package directives

import (
	"context"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/99designs/gqlgen/graphql"
	auth "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// DirectiveRoot holds the directive implementations for the GraphQL schema.
type DirectiveRoot struct {
	contentService     portservices.ContentService
	perspectiveService portservices.PerspectiveService
}

// NewDirectiveRoot creates a new DirectiveRoot with service dependencies for ownership checks.
func NewDirectiveRoot(contentService portservices.ContentService, perspectiveService portservices.PerspectiveService) *DirectiveRoot {
	return &DirectiveRoot{
		contentService:     contentService,
		perspectiveService: perspectiveService,
	}
}

// Auth enforces that the request is authenticated.
// Returns an error if no valid user context is present.
func (d *DirectiveRoot) Auth(ctx context.Context, obj interface{}, next graphql.Resolver) (interface{}, error) {
	_, authenticated := auth.ForContext(ctx)
	if !authenticated {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	return next(ctx)
}

// Owner enforces that the request is authenticated and the user owns the resource.
// Extracts the resource ID from the specified argument field, looks up the resource,
// and verifies the authenticated user is the owner.
func (d *DirectiveRoot) Owner(ctx context.Context, obj interface{}, next graphql.Resolver, idField string) (interface{}, error) {
	user, authenticated := auth.ForContext(ctx)
	if !authenticated {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	fc := graphql.GetFieldContext(ctx)

	// Extract resource ID from the specified argument
	resourceID, err := d.extractResourceID(fc, idField)
	if err != nil {
		return nil, err
	}

	// Determine resource type from the mutation field name and check ownership
	fieldName := fc.Field.Name
	if strings.Contains(strings.ToLower(fieldName), "perspective") {
		perspective, err := d.perspectiveService.GetByID(ctx, resourceID)
		if err != nil {
			return nil, fmt.Errorf("resource not found")
		}
		if perspective.UserID != user.ID {
			// Only a PUBLIC perspective is known to be visible to this user.
			// Anything else (PRIVATE today, or a future shared/unlisted state)
			// answers as if it didn't exist rather than confirming the id with
			// "access denied" -- matching perspectiveByID's null for non-owners.
			if perspective.Privacy == domain.PrivacyPublic {
				return nil, fmt.Errorf("access denied: you can only modify your own perspectives")
			}
			return nil, fmt.Errorf("resource not found")
		}
	} else if strings.Contains(strings.ToLower(fieldName), "content") {
		content, err := d.contentService.GetByID(ctx, resourceID)
		if err != nil {
			return nil, fmt.Errorf("resource not found")
		}
		if content.AddedByUserID != user.ID {
			return nil, fmt.Errorf("access denied: you can only modify your own content")
		}
	} else {
		return nil, fmt.Errorf("access denied: unknown resource type for ownership check")
	}

	return next(ctx)
}

// extractResourceID extracts an integer resource ID from GraphQL field arguments.
// Supports both top-level args (e.g., deletePerspective(id: ID!)) and
// nested input objects (e.g., updatePerspective(input: { id: 5 })).
func (d *DirectiveRoot) extractResourceID(fc *graphql.FieldContext, idField string) (int, error) {
	// Try top-level arg first (e.g., "id" in deletePerspective(id: ID!))
	if arg, ok := fc.Args[idField]; ok {
		return coerceToInt(arg, idField)
	}

	// Try nested in an "input" object (e.g., updatePerspective(input: { id: 5 })).
	// gqlgen binds `input` to its typed struct (model.UpdatePerspectiveInput),
	// not a map, so check the struct by json tag; the map branch keeps working
	// for any caller/test that passes a raw map.
	if inputArg, ok := fc.Args["input"]; ok {
		if inputMap, ok := inputArg.(map[string]interface{}); ok {
			if val, ok := inputMap[idField]; ok {
				return coerceToInt(val, idField)
			}
		} else if val, ok := fieldByJSONTag(inputArg, idField); ok {
			return coerceToInt(val, idField)
		}
	}

	return 0, fmt.Errorf("missing %s argument for ownership check", idField)
}

// fieldByJSONTag returns the value of the struct field whose `json` tag name
// matches tag, dereferencing pointers on both the struct and the field.
func fieldByJSONTag(v interface{}, tag string) (interface{}, bool) {
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return nil, false
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return nil, false
	}
	rt := rv.Type()
	for i := 0; i < rt.NumField(); i++ {
		name, _, _ := strings.Cut(rt.Field(i).Tag.Get("json"), ",")
		if name != tag {
			continue
		}
		fv := rv.Field(i)
		for fv.Kind() == reflect.Ptr {
			if fv.IsNil() {
				return nil, false
			}
			fv = fv.Elem()
		}
		if !fv.CanInterface() {
			return nil, false
		}
		return fv.Interface(), true
	}
	return nil, false
}

// coerceToInt converts various argument types to int.
func coerceToInt(val interface{}, fieldName string) (int, error) {
	switch v := val.(type) {
	case int:
		return v, nil
	case int64:
		return int(v), nil
	case float64:
		return int(v), nil
	case string:
		id, err := strconv.Atoi(v)
		if err != nil {
			return 0, fmt.Errorf("invalid %s: %s", fieldName, v)
		}
		return id, nil
	default:
		return 0, fmt.Errorf("invalid %s type: %T", fieldName, val)
	}
}
