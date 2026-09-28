# Social Features & Discussion System Research

**Project:** Perspectize v1.1/v2.0
**Domain:** Comment/Discussion system for content perspectives platform
**Researched:** 2026-02-16
**Overall confidence:** HIGH

## Executive Summary

Perspectize should implement a phased approach to social features, starting with simple comment threads and evolving toward real-time chat. The current stack (Go + gqlgen + PostgreSQL + GORM) fully supports this progression with minimal infrastructure additions.

**Phase 1 (v1.1):** Basic comment threads using PostgreSQL ltree for hierarchy, GraphQL queries/mutations, and polling for updates. This provides 80% of the value with 20% of the complexity.

**Phase 2 (v1.5-v2.0):** Real-time updates via GraphQL subscriptions using gqlgen's WebSocket transport. For horizontal scaling beyond a few thousand concurrent users, add Redis pub/sub.

**Phase 3 (v2.5+):** Advanced features including threaded replies to specific perspectives, AI-assisted moderation with Claude API, rich reactions (emoji), edit history, and notification system.

The research shows that the critical decision is NOT whether to use WebSockets vs. SSE (gqlgen makes this choice for us), but rather when to add Redis for scale and how to structure the database schema for both simple and complex threading requirements.

## 1. Discussion Architecture Options

### 1.1 Threading Models

Three primary models exist for comment hierarchies:

#### Adjacency List (Simple)
```sql
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES comments(id),
    content_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

**Pros:**
- Simple to understand and implement
- Easy to insert new comments
- Minimal storage overhead

**Cons:**
- Requires recursive CTEs to fetch thread trees (slow for deep threads)
- N+1 query problem when loading nested replies
- Performance degrades with depth

**Verdict:** Good for Phase 1 if you limit nesting depth (e.g., max 2 levels: comment → reply, no reply-to-reply). NOT recommended for true threaded discussions.

#### Materialized Path with PostgreSQL ltree
```sql
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    path ltree NOT NULL,  -- e.g., '1.2.5' represents comment 5 under 2 under 1
    content_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX comments_path_idx ON comments USING GIST (path);
CREATE INDEX comments_content_path_idx ON comments (content_id, path);
```

**Pros:**
- Single query to fetch entire thread tree
- Fast ancestor/descendant queries using ltree operators (`@>`, `<@`)
- Native PostgreSQL support with GiST indexes
- Depth-first ordering with simple ORDER BY path
- 500% faster than recursive CTEs (per Disqus case study)

**Cons:**
- Path must be updated if comment is moved (rare in practice)
- Slightly more complex insertion logic
- Path length limits (typically not an issue for comments)

**Verdict:** RECOMMENDED for Phase 1+. Best balance of performance, simplicity, and PostgreSQL-native support.

#### Nested Sets (Not Recommended)
Stores left/right boundary values. Very fast reads but complex writes (must update many rows on insert). Good for static hierarchies (org charts), terrible for dynamic comment threads.

### 1.2 Flat vs. Threaded

**Flat Comments:**
- All comments are siblings (no parent_id or minimal nesting)
- Sorted by timestamp or score
- Example: YouTube comments (top-level + 1 reply level)

**Threaded Comments:**
- Unlimited nesting depth
- Tree structure with branches
- Example: Reddit, Hacker News

**Recommendation:** Start with flat + 1 reply level (Phase 1), evolve to threaded with ltree (Phase 2). This matches user expectation progression and allows iterative complexity.

## 2. Database Schema

### 2.1 Phase 1 Schema (Simple Comments)

```sql
-- Core comment table
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,

    -- Content
    body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 10000),
    edited BOOLEAN NOT NULL DEFAULT false,
    deleted BOOLEAN NOT NULL DEFAULT false,  -- Soft delete for thread integrity

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),

    CONSTRAINT valid_parent CHECK (parent_id IS NULL OR parent_id != id)
);

-- Indexes for common queries
CREATE INDEX comments_content_idx ON comments (content_id, created_at DESC) WHERE deleted = false;
CREATE INDEX comments_user_idx ON comments (user_id, created_at DESC) WHERE deleted = false;
CREATE INDEX comments_parent_idx ON comments (parent_id, created_at DESC) WHERE deleted = false AND parent_id IS NOT NULL;

-- Comment reactions (emoji, like/dislike)
CREATE TABLE comment_reactions (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type VARCHAR(50) NOT NULL,  -- 'like', 'dislike', 'emoji:👍', etc.
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    UNIQUE(comment_id, user_id, reaction_type)
);

CREATE INDEX comment_reactions_comment_idx ON comment_reactions (comment_id, reaction_type);
CREATE INDEX comment_reactions_user_idx ON comment_reactions (user_id);
```

**Design decisions:**
- `parent_id` nullable for top-level comments
- `deleted` boolean for soft deletes (preserves thread structure)
- `edited` flag for transparency
- `body` length constraint (1-10K chars, adjust as needed)
- Separate `comment_reactions` table for scalability (vs. JSONB column)

### 2.2 Phase 2 Schema (ltree Threading)

```sql
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    path ltree NOT NULL,  -- Full path: '1.5.12' = comment 12 under 5 under 1
    depth INTEGER NOT NULL GENERATED ALWAYS AS (nlevel(path) - 1) STORED,
    content_id INTEGER NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Content
    body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 10000),
    edited BOOLEAN NOT NULL DEFAULT false,
    deleted BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Critical indexes for ltree queries
CREATE INDEX comments_path_gist_idx ON comments USING GIST (path);
CREATE INDEX comments_content_path_idx ON comments (content_id, path);
CREATE INDEX comments_user_idx ON comments (user_id, created_at DESC) WHERE deleted = false;

-- Query patterns:
-- All comments for content (depth-first order):
-- SELECT * FROM comments WHERE content_id = $1 ORDER BY path;

-- All replies to comment (immediate children):
-- SELECT * FROM comments WHERE path ~ '1.5.*{1}' ORDER BY path;

-- All descendants of comment:
-- SELECT * FROM comments WHERE path <@ '1.5' AND id != $1 ORDER BY path;

-- Parent comment:
-- SELECT * FROM comments WHERE path = subpath('1.5.12', 0, -1);
```

**ltree path generation strategy:**
```go
// When inserting a top-level comment:
// path = fmt.Sprintf("%d", newCommentID)

// When replying to a comment with path "1.5":
// path = fmt.Sprintf("%s.%d", parentPath, newCommentID)
```

**Migration path:** Adjacency list → ltree requires rebuilding paths. Do this before Phase 2 launch with a migration script.

### 2.3 Edit History (Optional Phase 3)

```sql
CREATE TABLE comment_history (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    edited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    edited_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX comment_history_comment_idx ON comment_history (comment_id, edited_at DESC);
```

**Design decision:** Store only edited versions, not original (original is in `comments.body`). On edit, insert current body into history before updating.

## 3. GraphQL Integration

### 3.1 Schema Extensions

```graphql
# Enums
enum CommentSortBy {
  CREATED_AT
  UPDATED_AT
  SCORE  # For future rating/voting
}

enum ReactionType {
  LIKE
  DISLIKE
  EMOJI_THUMBS_UP
  EMOJI_HEART
  EMOJI_LAUGH
  EMOJI_THINKING
}

# Types
type Comment {
  id: ID!
  contentID: ID!
  content: Content
  userID: ID!
  user: User!
  parentID: ID  # Null for top-level comments
  parent: Comment  # Resolver fetches parent if needed

  # Content
  body: String!
  edited: Boolean!
  deleted: Boolean!

  # Metadata
  createdAt: String!  # TODO: Use DateTime scalar
  updatedAt: String!

  # Nested data
  replies: [Comment!]!  # Immediate children only (for flat view)
  replyCount: Int!
  reactions: [CommentReaction!]!
  reactionSummary: [ReactionSummary!]!  # Aggregated counts
}

type CommentReaction {
  id: ID!
  commentID: ID!
  userID: ID!
  user: User!
  reactionType: ReactionType!
  createdAt: String!
}

type ReactionSummary {
  reactionType: ReactionType!
  count: Int!
}

type PaginatedComments {
  items: [Comment!]!
  pageInfo: PageInfo!
  totalCount: Int
}

# Inputs
input CreateCommentInput {
  contentID: IntID!
  parentID: IntID  # Null for top-level comment
  body: String!
}

input UpdateCommentInput {
  id: IntID!
  body: String!
}

input AddReactionInput {
  commentID: IntID!
  reactionType: ReactionType!
}

input RemoveReactionInput {
  commentID: IntID!
  reactionType: ReactionType!
}

input CommentFilter {
  contentID: IntID
  userID: IntID
  parentID: IntID  # Filter by parent (for fetching replies)
}

# Queries
extend type Query {
  commentByID(id: ID!): Comment

  comments(
    first: Int = 20
    after: String
    last: Int
    before: String
    sortBy: CommentSortBy = CREATED_AT
    sortOrder: SortOrder = DESC
    includeTotalCount: Boolean = false
    filter: CommentFilter
  ): PaginatedComments!

  # Convenience query for fetching all comments on content
  commentsForContent(
    contentID: ID!
    first: Int = 50
    after: String
  ): PaginatedComments!
}

# Mutations
extend type Mutation {
  createComment(input: CreateCommentInput!): Comment!
  updateComment(input: UpdateCommentInput!): Comment!
  deleteComment(id: ID!): Boolean!  # Soft delete

  addReaction(input: AddReactionInput!): CommentReaction!
  removeReaction(input: RemoveReactionInput!): Boolean!
}

# Subscriptions (Phase 2+)
extend type Subscription {
  commentAdded(contentID: ID!): Comment!
  commentUpdated(contentID: ID!): Comment!
  commentDeleted(contentID: ID!): ID!

  reactionAdded(commentID: ID!): CommentReaction!
  reactionRemoved(commentID: ID!, userID: ID!): ReactionType!
}
```

### 3.2 Resolver Patterns

**DataLoader for N+1 prevention:**
```go
// In your GraphQL resolver setup
func NewCommentLoaders(db *gorm.DB) *CommentLoaders {
    return &CommentLoaders{
        UserLoader: dataloader.NewBatchedLoader(func(ctx context.Context, userIDs []int) ([]User, []error) {
            // Batch fetch users
        }),
        ReactionCountLoader: dataloader.NewBatchedLoader(func(ctx context.Context, commentIDs []int) ([]map[ReactionType]int, []error) {
            // Batch fetch reaction counts
        }),
    }
}

// Comment.User resolver
func (r *commentResolver) User(ctx context.Context, obj *Comment) (*User, error) {
    return r.Loaders.UserLoader.Load(ctx, obj.UserID)
}

// Comment.ReactionSummary resolver
func (r *commentResolver) ReactionSummary(ctx context.Context, obj *Comment) ([]*ReactionSummary, error) {
    counts, err := r.Loaders.ReactionCountLoader.Load(ctx, obj.ID)
    if err != nil {
        return nil, err
    }

    result := make([]*ReactionSummary, 0, len(counts))
    for reactionType, count := range counts {
        result = append(result, &ReactionSummary{
            ReactionType: reactionType,
            Count: count,
        })
    }
    return result, nil
}
```

**Efficient comment tree loading (ltree):**
```go
func (r *queryResolver) CommentsForContent(ctx context.Context, contentID int, first *int, after *string) (*PaginatedComments, error) {
    query := r.DB.Where("content_id = ? AND deleted = false", contentID).Order("path ASC")

    // Apply cursor pagination if needed
    if after != nil {
        query = query.Where("path > ?", *after)  // Cursor is the ltree path
    }

    if first != nil {
        query = query.Limit(*first)
    }

    var comments []*Comment
    if err := query.Find(&comments).Error; err != nil {
        return nil, err
    }

    // Build tree structure in application layer
    return &PaginatedComments{
        Items: comments,
        PageInfo: buildPageInfo(comments),
        TotalCount: nil,  // Compute if includeTotalCount requested
    }, nil
}
```

### 3.3 Cursor Pagination for Comments

**Recommendation:** Use ltree path as cursor for comment pagination. Benefits:
- Stable ordering (path doesn't change)
- Depth-first traversal maintained
- No offset/limit performance penalty

**Cursor encoding:**
```go
// Encode ltree path as base64
func encodeCursor(path string) string {
    return base64.StdEncoding.EncodeToString([]byte(path))
}

func decodeCursor(cursor string) (string, error) {
    decoded, err := base64.StdEncoding.DecodeString(cursor)
    return string(decoded), err
}
```

## 4. Real-Time Implementation

### 4.1 gqlgen WebSocket Subscriptions

gqlgen provides native WebSocket support for GraphQL subscriptions via the `graphql-transport-ws` protocol.

**Setup (Phase 2):**
```go
import (
    "github.com/99designs/gqlgen/graphql/handler"
    "github.com/99designs/gqlgen/graphql/handler/transport"
)

func NewGraphQLHandler(resolver *Resolver) *handler.Server {
    srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
        Resolvers: resolver,
    }))

    // Add WebSocket transport for subscriptions
    srv.AddTransport(&transport.Websocket{
        KeepAlivePingInterval: 10 * time.Second,  // Detect dead connections
        Upgrader: websocket.Upgrader{
            CheckOrigin: func(r *http.Request) bool {
                // IMPORTANT: Implement proper origin checking for production
                origin := r.Header.Get("Origin")
                return origin == "https://yourdomain.com" || origin == "http://localhost:3000"
            },
        },
    })

    return srv
}
```

**Subscription resolver:**
```go
func (r *subscriptionResolver) CommentAdded(ctx context.Context, contentID int) (<-chan *Comment, error) {
    // Create channel for this subscription
    comments := make(chan *Comment, 1)

    // Register channel with pubsub system (in-memory or Redis)
    r.PubSub.Subscribe(ctx, fmt.Sprintf("comments.added.%d", contentID), func(comment *Comment) {
        select {
        case comments <- comment:
        case <-ctx.Done():
            // Client disconnected
        }
    })

    // Unsubscribe on context cancellation
    go func() {
        <-ctx.Done()
        close(comments)
        r.PubSub.Unsubscribe(ctx, fmt.Sprintf("comments.added.%d", contentID))
    }()

    return comments, nil
}

// In createComment mutation:
func (r *mutationResolver) CreateComment(ctx context.Context, input CreateCommentInput) (*Comment, error) {
    comment := &Comment{
        ContentID: input.ContentID,
        UserID: getCurrentUserID(ctx),
        Body: input.Body,
        // ...
    }

    if err := r.DB.Create(comment).Error; err != nil {
        return nil, err
    }

    // Publish to subscribers
    r.PubSub.Publish(fmt.Sprintf("comments.added.%d", input.ContentID), comment)

    return comment, nil
}
```

### 4.2 In-Memory PubSub (Single Server)

For Phase 2 with a single server instance, use an in-memory pubsub:

```go
type InMemoryPubSub struct {
    mu          sync.RWMutex
    subscribers map[string][]chan *Comment
}

func NewInMemoryPubSub() *InMemoryPubSub {
    return &InMemoryPubSub{
        subscribers: make(map[string][]chan *Comment),
    }
}

func (ps *InMemoryPubSub) Subscribe(ctx context.Context, topic string, handler func(*Comment)) {
    ps.mu.Lock()
    defer ps.mu.Unlock()

    ch := make(chan *Comment, 10)
    ps.subscribers[topic] = append(ps.subscribers[topic], ch)

    go func() {
        for {
            select {
            case comment := <-ch:
                handler(comment)
            case <-ctx.Done():
                return
            }
        }
    }()
}

func (ps *InMemoryPubSub) Publish(topic string, comment *Comment) {
    ps.mu.RLock()
    defer ps.mu.RUnlock()

    for _, ch := range ps.subscribers[topic] {
        select {
        case ch <- comment:
        default:
            // Skip slow consumers
        }
    }
}
```

**Pros:**
- Zero infrastructure overhead
- Low latency (no network hop)
- Simple to implement and debug

**Cons:**
- Single point of failure
- No horizontal scaling (subscriptions tied to server instance)

**Verdict:** Use for Phase 2. Good for 100-1000 concurrent WebSocket connections. Replace with Redis when scaling to multiple instances.

### 4.3 Redis PubSub (Multi-Server)

When scaling horizontally, use Redis to distribute subscription events:

```go
import "github.com/redis/go-redis/v9"

type RedisPubSub struct {
    client *redis.Client
}

func NewRedisPubSub(redisURL string) *RedisPubSub {
    opt, _ := redis.ParseURL(redisURL)
    client := redis.NewClient(opt)
    return &RedisPubSub{client: client}
}

func (ps *RedisPubSub) Subscribe(ctx context.Context, topic string, handler func(*Comment)) {
    pubsub := ps.client.Subscribe(ctx, topic)

    go func() {
        defer pubsub.Close()

        for {
            select {
            case msg := <-pubsub.Channel():
                var comment Comment
                if err := json.Unmarshal([]byte(msg.Payload), &comment); err == nil {
                    handler(&comment)
                }
            case <-ctx.Done():
                return
            }
        }
    }()
}

func (ps *RedisPubSub) Publish(topic string, comment *Comment) {
    data, _ := json.Marshal(comment)
    ps.client.Publish(context.Background(), topic, data)
}
```

**When to add Redis:**
- Running 2+ server instances (horizontal scaling)
- Need to support 1000+ concurrent WebSocket connections
- Want persistent message queuing (Redis Streams for durability)

**Cost:** Redis Cloud free tier supports 30MB (sufficient for Phase 2). Upgrade when needed.

### 4.4 WebSocket vs. SSE

**TL;DR:** Use WebSocket (via gqlgen) because:
1. gqlgen implements GraphQL subscriptions over WebSocket by default
2. Bidirectional communication allows client → server GraphQL mutations/queries on same connection
3. GraphQL ecosystem standardized on WebSocket (graphql-transport-ws protocol)

**SSE considerations:**
- SSE is simpler (server → client only) and HTTP-native (better firewall compatibility)
- Recent research shows SSE sufficient for 95% of real-time use cases (dashboards, notifications)
- But: GraphQL spec doesn't standardize SSE for subscriptions; WebSocket is the de facto standard

**Verdict:** Stick with gqlgen's WebSocket implementation. SSE would require custom transport layer with no ecosystem support.

### 4.5 PostgreSQL LISTEN/NOTIFY

PostgreSQL's LISTEN/NOTIFY can push database changes directly to application:

```go
import "github.com/lib/pq"

func startPostgresListener(connStr string, pubsub PubSub) {
    reportProblem := func(ev pq.ListenerEventType, err error) {
        if err != nil {
            log.Printf("postgres listener error: %v", err)
        }
    }

    listener := pq.NewListener(connStr, 10*time.Second, time.Minute, reportProblem)
    if err := listener.Listen("comment_added"); err != nil {
        log.Fatal(err)
    }

    for notification := range listener.Notify {
        var comment Comment
        if err := json.Unmarshal([]byte(notification.Extra), &comment); err == nil {
            pubsub.Publish(fmt.Sprintf("comments.added.%d", comment.ContentID), &comment)
        }
    }
}

// In Postgres, create trigger:
CREATE OR REPLACE FUNCTION notify_comment_added()
RETURNS trigger AS $$
DECLARE
    payload JSON;
BEGIN
    payload = row_to_json(NEW);
    PERFORM pg_notify('comment_added', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER comment_added_trigger
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION notify_comment_added();
```

**Pros:**
- No polling required
- Database-driven (single source of truth)
- Works with in-memory pubsub for single-server setup

**Cons:**
- Requires persistent database connection for listening
- Not compatible with connection pooling (must use separate connection)
- Doesn't work well with GORM (need raw lib/pq)

**Verdict:** OPTIONAL for Phase 2. Adds complexity. Only consider if you want database-driven real-time without polling. Most teams skip this and publish from application layer after DB write.

## 5. Moderation Strategy

### 5.1 AI-Assisted Moderation with Claude

Claude API provides nuanced content moderation for user-generated comments.

**Integration pattern:**
```go
import anthropic "github.com/anthropic-ai/anthropic-sdk-go"

type ModerationResult struct {
    Action   string  // "ALLOW", "REVIEW", "BLOCK"
    Category string  // "safe", "spam", "harassment", etc.
    Confidence float64
}

func moderateComment(body string) (*ModerationResult, error) {
    client := anthropic.NewClient(os.Getenv("ANTHROPIC_API_KEY"))

    prompt := fmt.Sprintf(`You are a content moderator. Evaluate this comment:

Comment: "%s"

Classify as:
- ALLOW: Safe, constructive comment
- REVIEW: Borderline content needing human review (mild toxicity, spam, off-topic)
- BLOCK: Clear violation (harassment, hate speech, illegal content)

Respond with JSON: {"action": "ALLOW|REVIEW|BLOCK", "category": "...", "confidence": 0.0-1.0}`, body)

    resp, err := client.Messages.Create(context.Background(), anthropic.MessageCreateParams{
        Model: "claude-sonnet-4-5-20250929",
        Messages: []anthropic.MessageParam{
            {Role: "user", Content: prompt},
        },
        MaxTokens: 200,
    })

    if err != nil {
        return nil, err
    }

    var result ModerationResult
    json.Unmarshal([]byte(resp.Content[0].Text), &result)
    return &result, nil
}

// In CreateComment mutation:
func (r *mutationResolver) CreateComment(ctx context.Context, input CreateCommentInput) (*Comment, error) {
    // Moderate before saving
    modResult, err := moderateComment(input.Body)
    if err != nil {
        // Log error, but don't block comment (fail open)
        log.Printf("moderation error: %v", err)
    }

    if modResult != nil && modResult.Action == "BLOCK" {
        return nil, fmt.Errorf("comment violates community guidelines")
    }

    comment := &Comment{
        Body: input.Body,
        ReviewStatus: determineReviewStatus(modResult),
        // ...
    }

    if err := r.DB.Create(comment).Error; err != nil {
        return nil, err
    }

    return comment, nil
}

func determineReviewStatus(modResult *ModerationResult) string {
    if modResult == nil {
        return "APPROVED"  // Fail open
    }

    switch modResult.Action {
    case "BLOCK":
        return "REJECTED"
    case "REVIEW":
        return "PENDING"
    default:
        return "APPROVED"
    }
}
```

**Moderation schema addition:**
```sql
ALTER TABLE comments ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';
ALTER TABLE comments ADD COLUMN moderation_category VARCHAR(50);
ALTER TABLE comments ADD COLUMN moderation_confidence FLOAT;

-- Index for moderator dashboard
CREATE INDEX comments_review_status_idx ON comments (review_status, created_at DESC)
WHERE review_status = 'PENDING';
```

**GraphQL extension:**
```graphql
enum ReviewStatus {
  APPROVED
  PENDING
  REJECTED
}

type Comment {
  # ... existing fields
  reviewStatus: ReviewStatus!
  moderationCategory: String
}

extend type Query {
  # Moderator dashboard
  commentsForReview(
    first: Int = 20
    after: String
  ): PaginatedComments!
}

extend type Mutation {
  # Moderator actions
  approveComment(id: ID!): Comment!
  rejectComment(id: ID!, reason: String): Boolean!
}
```

**Cost estimate:** Claude Sonnet 4.5 costs ~$3 per 1M input tokens. At 200 tokens per comment (generous), that's $0.0006 per comment. For 1M comments/month: $600. Haiku reduces this 5x to $120/month.

**Optimization:** Batch moderation for low-risk users (trust score), moderate only first N comments for new users.

### 5.2 User-Driven Moderation

**Flag system:**
```sql
CREATE TABLE comment_flags (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    flagger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(50) NOT NULL,  -- 'spam', 'harassment', 'off-topic', etc.
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),

    UNIQUE(comment_id, flagger_id)
);

CREATE INDEX comment_flags_comment_idx ON comment_flags (comment_id);
```

**Auto-hide threshold:**
```go
const AUTO_HIDE_FLAG_THRESHOLD = 3

func (r *mutationResolver) FlagComment(ctx context.Context, input FlagCommentInput) error {
    flag := &CommentFlag{
        CommentID: input.CommentID,
        FlaggerID: getCurrentUserID(ctx),
        Reason: input.Reason,
    }

    if err := r.DB.Create(flag).Error; err != nil {
        return err
    }

    // Check if threshold reached
    var flagCount int64
    r.DB.Model(&CommentFlag{}).Where("comment_id = ?", input.CommentID).Count(&flagCount)

    if flagCount >= AUTO_HIDE_FLAG_THRESHOLD {
        // Auto-hide (soft delete) and flag for review
        r.DB.Model(&Comment{}).Where("id = ?", input.CommentID).Updates(map[string]interface{}{
            "deleted": true,
            "review_status": "PENDING",
        })
    }

    return nil
}
```

**Trust levels:**
```sql
ALTER TABLE users ADD COLUMN trust_level INTEGER NOT NULL DEFAULT 0;
-- 0 = New user (full moderation)
-- 1 = Trusted (skip AI moderation)
-- 2 = Moderator (can review flags)
-- 3 = Admin (full permissions)
```

Grant trust_level 1 after N approved comments and M days of activity.

## 6. Notification System

### 6.1 Database Schema

```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- Who triggered it

    -- Polymorphic reference to source entity
    entity_type VARCHAR(50) NOT NULL,  -- 'comment', 'reaction', 'mention'
    entity_id INTEGER NOT NULL,

    -- Notification content
    notification_type VARCHAR(50) NOT NULL,  -- 'comment_reply', 'reaction_added', 'mentioned'
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,  -- Deep link to entity (e.g., /content/123#comment-456)

    -- Metadata
    read BOOLEAN NOT NULL DEFAULT false,
    emailed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Indexes for user notification queries
CREATE INDEX notifications_user_read_idx ON notifications (user_id, read, created_at DESC);
CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

-- Partitioning by created_at for efficient pruning (optional for Phase 3)
-- CREATE TABLE notifications_2026_02 PARTITION OF notifications FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

**Design decisions:**
- **Polymorphic references** (`entity_type` + `entity_id`) avoid separate tables per notification type
- **Actor** stores who triggered the notification (can be null if system-generated)
- **Denormalized content** (`title`, `body`) for display without JOIN (content rarely changes)
- **Monthly partitioning** for old notification cleanup (after 90 days)

### 6.2 Notification Triggers

```go
// After creating a reply comment:
func (r *mutationResolver) CreateComment(ctx context.Context, input CreateCommentInput) (*Comment, error) {
    comment := &Comment{...}
    if err := r.DB.Create(comment).Error; err != nil {
        return nil, err
    }

    // If this is a reply, notify parent comment author
    if input.ParentID != nil {
        var parentComment Comment
        r.DB.First(&parentComment, *input.ParentID)

        if parentComment.UserID != comment.UserID {  // Don't notify self
            notification := &Notification{
                UserID: parentComment.UserID,
                ActorID: &comment.UserID,
                EntityType: "comment",
                EntityID: comment.ID,
                NotificationType: "comment_reply",
                Title: fmt.Sprintf("%s replied to your comment", getUserName(comment.UserID)),
                Body: truncate(comment.Body, 200),
                Link: fmt.Sprintf("/content/%d#comment-%d", comment.ContentID, comment.ID),
            }
            r.DB.Create(notification)

            // Real-time push via WebSocket subscription
            r.PubSub.Publish(fmt.Sprintf("notifications.%d", parentComment.UserID), notification)
        }
    }

    return comment, nil
}
```

**Notification types to implement:**
1. **comment_reply**: Someone replied to your comment
2. **reaction_added**: Someone reacted to your comment (batch/throttle these)
3. **mentioned**: You were @mentioned in a comment (requires @username parsing)
4. **content_comment**: New comment on content you're following (Phase 3)

### 6.3 GraphQL Schema

```graphql
type Notification {
  id: ID!
  userID: ID!
  actorID: ID
  actor: User  # Resolver fetches actor user

  entityType: String!
  entityID: ID!

  notificationType: String!
  title: String!
  body: String
  link: String

  read: Boolean!
  emailed: Boolean!
  createdAt: String!
}

type PaginatedNotifications {
  items: [Notification!]!
  pageInfo: PageInfo!
  totalCount: Int
  unreadCount: Int!
}

extend type Query {
  notifications(
    first: Int = 20
    after: String
    unreadOnly: Boolean = false
  ): PaginatedNotifications!

  unreadNotificationCount: Int!
}

extend type Mutation {
  markNotificationAsRead(id: ID!): Notification!
  markAllNotificationsAsRead: Int!  # Returns count marked
  deleteNotification(id: ID!): Boolean!
}

extend type Subscription {
  notificationReceived(userID: ID!): Notification!
}
```

### 6.4 Email Notifications (Phase 3)

**Batching strategy:** Don't send email for every notification. Batch by time window:

```go
// Cron job runs every 15 minutes
func sendNotificationDigests() {
    // Find users with unread, unemailed notifications
    var users []int
    db.Model(&Notification{}).
        Where("read = false AND emailed = false").
        Distinct("user_id").
        Pluck("user_id", &users)

    for _, userID := range users {
        var notifications []Notification
        db.Where("user_id = ? AND read = false AND emailed = false", userID).
            Order("created_at DESC").
            Limit(10).  // Max 10 in email
            Find(&notifications)

        // Send digest email
        sendDigestEmail(userID, notifications)

        // Mark as emailed
        db.Model(&Notification{}).
            Where("user_id = ? AND read = false AND emailed = false", userID).
            Update("emailed", true)
    }
}
```

Use a simple SMTP library or service (SendGrid, Postmark, AWS SES).

## 7. SvelteKit Frontend Patterns

### 7.1 GraphQL Client Setup

**Current stack:** SvelteKit + TanStack Query. For subscriptions, add WebSocket client.

**Option 1: graphql-ws (Recommended)**
```typescript
// src/lib/graphql/client.ts
import { createClient } from 'graphql-ws';
import { GraphQLClient } from 'graphql-request';

// HTTP client for queries/mutations
export const gqlClient = new GraphQLClient('http://localhost:8080/graphql', {
  credentials: 'include',  // Send cookies for auth
});

// WebSocket client for subscriptions
export const wsClient = createClient({
  url: 'ws://localhost:8080/graphql',
  connectionParams: () => ({
    // Include auth token if needed
    authorization: localStorage.getItem('auth_token'),
  }),
});

// Subscription helper
export function subscribe<T>(query: string, variables: any, onData: (data: T) => void) {
  const unsubscribe = wsClient.subscribe(
    { query, variables },
    {
      next: (result) => onData(result.data as T),
      error: (err) => console.error('Subscription error:', err),
      complete: () => console.log('Subscription complete'),
    }
  );

  return unsubscribe;
}
```

**Option 2: urql (Alternative)**
urql provides unified client for queries, mutations, AND subscriptions:

```typescript
import { Client, cacheExchange, fetchExchange, subscriptionExchange } from '@urql/core';
import { createClient as createWSClient } from 'graphql-ws';

const wsClient = createWSClient({
  url: 'ws://localhost:8080/graphql',
});

export const urqlClient = new Client({
  url: 'http://localhost:8080/graphql',
  exchanges: [
    cacheExchange,
    fetchExchange,
    subscriptionExchange({
      forwardSubscription: (operation) => ({
        subscribe: (sink) => ({
          unsubscribe: wsClient.subscribe(operation, sink),
        }),
      }),
    }),
  ],
});
```

**Verdict:** If you're happy with TanStack Query for queries/mutations, use graphql-ws for subscriptions only. If you want unified client, switch to urql.

### 7.2 Comment Component (Svelte 5)

```svelte
<!-- CommentThread.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { gqlClient, subscribe } from '$lib/graphql/client';
  import { writable } from 'svelte/store';

  interface Props {
    contentID: number;
  }

  let { contentID }: Props = $props();

  // State
  let comments = $state<Comment[]>([]);
  let unsubscribe: (() => void) | null = null;

  // Query for initial comments
  const commentsQuery = createQuery({
    queryKey: ['comments', contentID],
    queryFn: async () => {
      const data = await gqlClient.request(COMMENTS_QUERY, { contentID });
      return data.commentsForContent.items;
    },
  });

  // Subscribe to new comments
  onMount(() => {
    unsubscribe = subscribe(
      COMMENT_ADDED_SUBSCRIPTION,
      { contentID },
      (data: { commentAdded: Comment }) => {
        // Add new comment to list
        comments = [data.commentAdded, ...comments];
      }
    );
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  // Sync query data to state
  $effect(() => {
    if ($commentsQuery.data) {
      comments = $commentsQuery.data;
    }
  });
</script>

<div class="comment-thread">
  {#if $commentsQuery.isLoading}
    <p>Loading comments...</p>
  {:else if $commentsQuery.error}
    <p>Error loading comments</p>
  {:else}
    {#each comments as comment (comment.id)}
      <CommentCard {comment} />
    {/each}
  {/if}

  <CommentForm {contentID} />
</div>

<style>
  .comment-thread {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
```

### 7.3 Real-Time Optimistic Updates

```typescript
// CommentForm.svelte
import { createMutation, useQueryClient } from '@tanstack/svelte-query';

const queryClient = useQueryClient();

const createCommentMutation = createMutation({
  mutationFn: async (input: CreateCommentInput) => {
    return await gqlClient.request(CREATE_COMMENT_MUTATION, { input });
  },
  onMutate: async (newComment) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['comments', contentID] });

    // Snapshot previous value
    const previousComments = queryClient.getQueryData(['comments', contentID]);

    // Optimistically update
    queryClient.setQueryData(['comments', contentID], (old: Comment[]) => [
      { ...newComment, id: 'temp-' + Date.now(), createdAt: new Date().toISOString() },
      ...old,
    ]);

    return { previousComments };
  },
  onError: (err, newComment, context) => {
    // Rollback on error
    queryClient.setQueryData(['comments', contentID], context?.previousComments);
  },
  onSuccess: () => {
    // Refetch to get server-generated ID
    queryClient.invalidateQueries({ queryKey: ['comments', contentID] });
  },
});
```

### 7.4 Nested Reply UI

For ltree-based threading, render tree recursively:

```svelte
<!-- CommentTree.svelte -->
<script lang="ts">
  interface Props {
    comments: Comment[];
    depth?: number;
  }

  let { comments, depth = 0 }: Props = $props();

  // Group comments by parent
  const commentsByParent = $derived(
    comments.reduce((acc, comment) => {
      const parentID = comment.parentID ?? 'root';
      if (!acc[parentID]) acc[parentID] = [];
      acc[parentID].push(comment);
      return acc;
    }, {} as Record<string, Comment[]>)
  );

  function getReplies(commentID: number): Comment[] {
    return commentsByParent[commentID] ?? [];
  }
</script>

<div class="comment-tree" style="--depth: {depth}">
  {#each comments.filter(c => depth === 0 ? !c.parentID : true) as comment (comment.id)}
    <div class="comment-node">
      <CommentCard {comment} />

      {#if getReplies(comment.id).length > 0}
        <svelte:self comments={getReplies(comment.id)} depth={depth + 1} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .comment-tree {
    margin-left: calc(var(--depth) * 2rem);
  }

  .comment-node {
    border-left: 2px solid var(--border-color);
    padding-left: 1rem;
  }
</style>
```

## 8. Scaling Path

### 8.1 Single Server (0-1K concurrent users)

**Architecture:**
- Go server with gqlgen + in-memory pubsub
- PostgreSQL with ltree for comments
- WebSocket subscriptions handled by single instance

**Bottlenecks:**
- WebSocket connections limited by server memory/file descriptors (~10K connections)
- All subscriptions lost on server restart

**Cost:** $20-50/month (DigitalOcean Droplet or Fly.io)

### 8.2 Horizontal Scaling (1K-10K concurrent users)

**Changes needed:**
1. **Add Redis** for cross-server pubsub
2. **Add load balancer** with sticky sessions (WebSocket connections must stay on same server)
3. **Add Redis for session storage** (if using session-based auth)

**Updated architecture:**
```
[Client] --> [Load Balancer (sticky sessions)]
              |
              +--> [Go Server 1] --+
              |                     |
              +--> [Go Server 2] ---+--> [Redis PubSub]
              |                     |
              +--> [Go Server 3] --+
                                    |
                                    +--> [PostgreSQL]
```

**Sticky sessions required:** Each WebSocket subscription is tied to a specific server instance. Use load balancer's sticky session feature (e.g., nginx `ip_hash` or HAProxy cookie-based).

**Cost:** $100-300/month (3x servers + Redis + load balancer)

### 8.3 High Scale (10K+ concurrent users)

**Additional optimizations:**
1. **Separate WebSocket servers** from HTTP API servers
   - WebSocket servers are stateful (long-lived connections)
   - HTTP servers are stateless (can scale independently)
2. **Redis Streams** for durable message queuing (vs. Redis pubsub which is ephemeral)
3. **Read replicas** for PostgreSQL (comment reads can hit replicas)
4. **CDN caching** for static content and GraphQL responses (with cache-control headers)
5. **Rate limiting** per user/IP to prevent abuse

**Architecture:**
```
[Client] --> [CDN (Cloudflare)]
              |
              +--> [Load Balancer (HTTP)] --> [Go API Servers (3x)] --+
              |                                                        |
              +--> [Load Balancer (WS)] --> [Go WS Servers (3x)] -----+--> [Redis Cluster]
                                                                       |
                                                                       +--> [Postgres Primary]
                                                                       |
                                                                       +--> [Postgres Replicas (2x)]
```

**Cost:** $500-1500/month (dedicated servers, Redis cluster, Postgres HA)

### 8.4 Scaling Checklist

| Metric | Threshold | Action |
|--------|-----------|--------|
| Concurrent WebSocket connections | > 5K | Add Redis pubsub + second server instance |
| Concurrent WebSocket connections | > 20K | Separate WebSocket servers from API servers |
| Comment query latency | > 500ms | Add PostgreSQL read replicas |
| Redis memory usage | > 1GB | Upgrade Redis plan or use Redis Streams with TTL |
| Database connections | > 80% of max | Increase connection pool size or add pgbouncer |
| Comment write rate | > 100/sec | Batch notification creation, optimize indexes |

## 9. Implementation Phases

### Phase 1: Simple Comments (v1.1 - 2 weeks)

**Goal:** Basic comment threads on content items, no real-time.

**Scope:**
- PostgreSQL schema (comments, comment_reactions tables)
- GraphQL mutations: createComment, updateComment, deleteComment (soft)
- GraphQL queries: commentsForContent (paginated), commentByID
- Basic DataLoaders for N+1 prevention
- SvelteKit UI: CommentThread, CommentCard, CommentForm
- Adjacency list OR ltree (recommend ltree from start)

**Deferred:**
- Real-time subscriptions (use polling or manual refresh)
- Moderation (trust all comments initially)
- Notifications
- Nested replies (only top-level comments OR limit to 1 reply level)

**Success criteria:**
- Users can post/edit/delete comments on content
- Comments load with < 300ms p95 latency
- UI feels responsive (optimistic updates)

**Estimated effort:** 40-60 hours (including testing)

### Phase 2: Real-Time Updates (v1.5 - 1 week)

**Goal:** Live comment updates without page refresh.

**Scope:**
- gqlgen WebSocket transport setup
- GraphQL subscriptions: commentAdded, commentUpdated, commentDeleted
- In-memory pubsub for single-server deployment
- SvelteKit WebSocket client (graphql-ws)
- Subscribe to comments on current content page

**Success criteria:**
- New comments appear in real-time for all viewers on same content
- WebSocket connections recover gracefully on disconnect
- No memory leaks on long-lived connections

**Estimated effort:** 20-30 hours

### Phase 3: Moderation & Notifications (v2.0 - 2 weeks)

**Goal:** Keep discussions healthy and users engaged.

**Scope:**
- AI moderation with Claude API (block/review/allow)
- User flag system (flag comment, auto-hide at threshold)
- Notification schema and triggers (comment_reply, reaction_added)
- GraphQL queries/mutations for notifications
- Notification bell UI in SvelteKit
- Real-time notification delivery via WebSocket subscription

**Deferred:**
- Email notifications (Phase 4)
- Advanced trust levels (Phase 4)

**Success criteria:**
- Toxic comments are blocked or flagged for review
- Users receive notifications for replies to their comments
- Notification bell shows unread count

**Estimated effort:** 50-70 hours

### Phase 4: Advanced Features (v2.5+ - 3+ weeks)

**Scope (pick based on user demand):**
- Threaded replies to perspectives (not just content)
- Edit history tracking
- Email notification digests
- @mentions with autocomplete
- Rich reactions (emoji picker)
- Comment sorting (best, newest, oldest)
- Moderator dashboard
- User trust levels and auto-approval
- Comment search

**Estimated effort:** Varies by feature (10-40 hours each)

### Phase 5: Scaling (as needed)

**Triggers:**
- > 1K concurrent WebSocket connections
- > 100 comments/second write rate
- > 500ms comment query p95 latency

**Scope:**
- Redis pubsub for multi-server
- Load balancer with sticky sessions
- PostgreSQL read replicas
- Separate WebSocket servers from API servers
- Rate limiting and abuse prevention

**Estimated effort:** 40-60 hours (infrastructure + code changes)

## 10. Recommendations & Next Steps

### 10.1 Start Simple, Scale Incrementally

**Phase 1 (v1.1) is the foundation.** Get basic comments working well before adding real-time or moderation. Users value reliability over real-time in early stages.

**Recommended Phase 1 tech decisions:**
- **Use ltree from the start** (easier to add threading later vs. migrating from adjacency list)
- **Soft delete comments** (preserve thread structure)
- **Denormalize reaction counts** (store total count in comments table for sorting)

### 10.2 Architecture Decision Summary

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Threading model** | PostgreSQL ltree | 500% faster than recursive CTEs, native support |
| **Real-time transport** | gqlgen WebSocket (graphql-transport-ws) | Ecosystem standard, bidirectional |
| **PubSub (Phase 2)** | In-memory | Zero infrastructure, sufficient for single server |
| **PubSub (Phase 3+)** | Redis | Horizontal scaling, proven at scale |
| **Moderation** | Claude API + user flags | AI reduces manual work, flags catch edge cases |
| **Pagination** | Cursor-based (ltree path as cursor) | Stable, efficient for nested data |
| **SvelteKit client** | TanStack Query + graphql-ws | Leverage existing stack, add WebSocket only |

### 10.3 Open Questions for Product Team

1. **Nesting depth limit:** Allow unlimited threading or cap at N levels (recommend 3-5)?
2. **Comment length:** Max 10K characters or shorter (e.g., 2K for Twitter-style brevity)?
3. **Moderation strategy:** Auto-block toxic comments or flag for review?
4. **Notification preferences:** Real-time only or also email digests?
5. **Reaction types:** Simple like/dislike or rich emoji palette?

### 10.4 Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Spam/abuse** | High (degrades UX) | Phase 1: Rate limiting. Phase 3: AI moderation + flags |
| **WebSocket scaling** | Medium (concurrent user cap) | Start with single server, add Redis when needed |
| **Deep thread performance** | Low (rare) | Limit nesting depth to 5 levels |
| **Comment edit wars** | Low (rare) | Store edit history, show "edited" badge |
| **Dead WebSocket connections** | Medium (memory leak) | gqlgen KeepAlivePingInterval + client-side reconnect |

### 10.5 Metrics to Track

**Phase 1:**
- Comments per content item (median, p95)
- Comment query latency (p50, p95, p99)
- Comment write rate (per second, per hour)

**Phase 2:**
- Concurrent WebSocket connections
- WebSocket message latency (publish → client receive)
- WebSocket connection lifetime (median, churn rate)

**Phase 3:**
- Moderation accuracy (false positive rate from user appeals)
- Notification delivery latency (create → user sees)
- Unread notification count per user (avoid notification fatigue)

### 10.6 Next Steps

1. **Review with product team:** Confirm Phase 1 scope and design decisions
2. **Create GSD plan for Phase 1:** Break down into tasks with acceptance criteria
3. **Prototype ltree schema:** Test query patterns with sample data
4. **Set up GraphQL schema:** Add comment types/mutations to schema.graphql
5. **Implement backend:** Comment repository, service, resolvers (2-3 days)
6. **Implement frontend:** CommentThread component with TanStack Query (2-3 days)
7. **Test at scale:** Load test with 1K comments per content item
8. **Ship Phase 1 → gather feedback → plan Phase 2**

---

## Sources

### GraphQL Subscriptions & gqlgen
- [Subscriptions — gqlgen](https://gqlgen.com/recipes/subscriptions/)
- [GraphQL Subscriptions with Go (gqlgen) Example - Stefan Gloutnikov](https://gloutnikov.com/post/graphql-subscriptions-go-gqlgen-example/)
- [transport package - github.com/99designs/gqlgen/graphql/handler/transport - Go Packages](https://pkg.go.dev/github.com/99designs/gqlgen/graphql/handler/transport)
- [gqlgen/graphql/handler/transport/websocket.go at master · 99designs/gqlgen](https://github.com/99designs/gqlgen/blob/master/graphql/handler/transport/websocket.go)

### PostgreSQL Threading & ltree
- [Materialized Path in PostgreSQL](https://evileg.com/en/post/12/)
- [Store Trees As Materialized Paths - Database Tip](https://sqlfordevs.com/tree-as-materialized-path)
- [DAGs with materialized paths using postgres ltree – bustawin](https://www.bustawin.com/dags-with-materialized-paths-using-postgres-ltree/)
- [PostgreSQL: Documentation: 18: F.22. ltree — hierarchical tree-like data type](https://www.postgresql.org/docs/current/ltree.html)
- [Postgres CTE for Threaded Comments](https://illuminatedcomputing.com/posts/2014/09/postgres-cte-for-threaded-comments/)

### Real-Time: WebSocket vs SSE
- [WebSockets vs Server-Sent Events (SSE)](https://ably.com/blog/websockets-vs-sse)
- [Why Server-Sent Events Beat WebSockets for 95% of Real-Time Cloud Applications | by Anurag singh | CodeToDeploy | Jan, 2026 | Medium](https://medium.com/codetodeploy/why-server-sent-events-beat-websockets-for-95-of-real-time-cloud-applications-830eff5a1d7c)
- [SSE vs WebSockets: Comparing Real-Time Communication Protocols | SoftwareMill](https://softwaremill.com/sse-vs-websockets-comparing-real-time-communication-protocols/)
- [Server-Sent Events: the alternative to WebSockets you should be using - germano.dev](https://germano.dev/sse-websockets/)

### SvelteKit WebSocket Clients
- [Set up GraphQL Subscriptions using Apollo Client | Svelte Apollo GraphQL Tutorial](https://hasura.io/learn/graphql/svelte-apollo/subscriptions/1-subscription/)
- [How to connect Hasura GraphQL real-time Subscription to a reactive Svelte frontend using RxJS and the new graphql-ws Web Socket protocol+library | ʻenehana – Hekili Tech](http://enehana.nohea.com/general/graphql-ws-usage-with-hasura-and-svelte/)
- [Usage with SvelteKit · urql-graphql/urql · Discussion #1664](https://github.com/FormidableLabs/urql/discussions/1664)

### AI Moderation
- [Content moderation - Claude API Docs](https://platform.claude.com/docs/en/about-claude/use-case-guides/content-moderation)
- [claude-cookbooks/misc/building_moderation_filter.ipynb at main · anthropics/claude-cookbooks](https://github.com/anthropic/anthropic-cookbook/blob/main/misc/building_moderation_filter.ipynb)
- [Master moderator - Claude API Docs](https://platform.claude.com/docs/en/resources/prompt-library/master-moderator)

### Notification Systems
- [Designing a notification system | Notification database design | Medium](https://tannguyenit95.medium.com/designing-a-notification-system-1da83ca971bc)
- [Guide To Design Database For Notifications In MySQL | Tutorials24x7](https://mysql.tutorials24x7.com/blog/guide-to-design-database-for-notifications-in-mysql)
- [Notification System Design: Architecture & Best Practices](https://www.magicbell.com/blog/notification-system-design)
- [Building a Notification System in Ruby on Rails: DB Design](https://www.magicbell.com/blog/building-notification-system-ruby-on-rails-database-design)

### Redis PubSub & Scaling
- [GraphQL subscriptions with Redis Pub Sub - Apollo GraphQL Blog](https://www.apollographql.com/blog/graphql-subscriptions-with-redis-pub-sub)
- [GitHub - davidyaha/graphql-redis-subscriptions](https://github.com/davidyaha/graphql-redis-subscriptions)
- [A dream of scalable and enriched GraphQL subscriptions | by Artjom Kurapov | Pipedrive R&D Blog | Medium](https://medium.com/pipedrive-engineering/a-dream-of-scalable-and-enriched-graphql-subscriptions-724284448e65)
- [Scaling GraphQL with Redis Consumer Groups | Parabol](https://www.parabol.co/blog/scaling-graphql-with-redis-consumer-groups/)

### PostgreSQL LISTEN/NOTIFY
- [support LISTEN/NOTIFY · Issue #273 · go-gorm/postgres](https://github.com/go-gorm/postgres/issues/273)
- [Go and Postgres Listen/Notify or: How I Learned to Stop Worrying and Love PubSub :: Jon Brown's Webpage](https://brojonat.com/posts/go-postgres-listen-notify/)
- [Building a Real-Time Notification System in Go with PostgreSQL](https://www.finly.ch/engineering-blog/436253-building-a-real-time-notification-system-in-go-with-postgresql)
- [How to Use Listen/Notify for Real-Time Updates in PostgreSQL](https://oneuptime.com/blog/post/2026-01-25-use-listen-notify-real-time-postgresql/view)

### GraphQL Pagination
- [Pagination | GraphQL](https://graphql.org/learn/pagination/)
- [Cursor-based pagination - Apollo GraphQL Docs](https://www.apollographql.com/docs/react/pagination/cursor-based)
- [How to implement cursor-based pagination in GraphQL - LogRocket Blog](https://blog.logrocket.com/implement-cursor-based-pagination-graphql/)
- [GraphQL Pagination: Cursor vs Offset Explained (With Code Examples) | Agility CMS](https://agilitycms.com/blog/graphql-pagination-cursor-vs-offset-explained)

### Go WebSocket Libraries
- [Update comparison table by nhooyr · Pull Request #543 · gorilla/websocket](https://github.com/gorilla/websocket/pull/543)
- [GitHub - coder/websocket: Minimal and idiomatic WebSocket library for Go](https://github.com/coder/websocket)
- [GitHub - gorilla/websocket: Package gorilla/websocket is a fast, well-tested and widely used WebSocket implementation for Go](https://github.com/gorilla/websocket)
