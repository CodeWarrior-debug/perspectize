# Go Database Libraries Research: Reducing Boilerplate with sqlx and GORM

**Date:** 2026-02-13
**Purpose:** Research specific Go libraries that reduce boilerplate when using sqlx or GORM with PostgreSQL

---

## 1. Query Builders That Work WITH sqlx

### 1.1 Squirrel
- **GitHub:** https://github.com/Masterminds/squirrel — 7,900 stars
- **Last Commit:** March 2023 (maintenance mode)
- **pgx/v5:** Yes
- Best for: Simple, readable dynamic query building
- Cons: No struct scanning, development slowed

### 1.2 Goqu
- **GitHub:** https://github.com/doug-martin/goqu — 2,600 stars
- **Last Commit:** Active 2025
- **pgx/v5:** Partial (known issues with pgx BinaryEncoder types)
- Best for: Feature-rich (CTEs, window functions, complex joins)
- Cons: pgx compatibility issues, API can be overwhelming

### 1.3 Bob
- **GitHub:** https://github.com/stephenafamo/bob — 1,600 stars
- **Last Commit:** November 2025 (very active)
- **pgx/v5:** Yes (dedicated pgx driver package)
- Best for: Modern, fully spec-compliant SQL builder + ORM code generation
- Cons: More complex setup, different API from Squirrel/Goqu

### 1.4 dbr
- **GitHub:** https://github.com/gocraft/dbr — 1,900 stars
- **Last Commit:** October 2024
- **pgx/v5:** Yes
- Best for: Fastest for simple queries, includes built-in struct scanning
- Cons: No prepared statements, less feature-rich

---

## 2. Struct Scanning Helpers

### 2.1 scany
- **GitHub:** https://github.com/georgysavva/scany — 1,500 stars
- **Last Commit:** March 2025
- **pgx/v5:** Yes (v2.0.0+)
- Best for: Eliminating manual row iteration. Works with pgx native interface.

---

## 3. Null Type Alternatives

### 3.1 guregu/null
- **GitHub:** https://github.com/guregu/null — 2,100 stars
- **Last Commit:** March 2025 (v6.0.0)
- Battle-tested, clean API, JSON support. "Essentially finished" per maintainer.

### 3.2 gonull (Generics-based)
- **GitHub:** https://github.com/LukaGiorgadze/gonull — 129 stars
- **Last Commit:** June 2025
- Modern `Nullable[T]` using Go generics. Newer, less battle-tested.

### 3.3 volatiletech/null — STALE, avoid unless using SQLBoiler

---

## 4. GORM + Hexagonal Architecture

**Yes, you CAN use GORM without putting gorm tags on domain models.**

Pattern:
1. Domain models (clean, no tags) in `domain/`
2. GORM models (with tags) in `infrastructure/persistence/`
3. Repository maps between them

```go
// Domain model (no GORM tags)
type User struct {
    ID        string
    Name      string
    Email     string
    CreatedAt time.Time
}

// GORM model (infrastructure layer only)
type UserGORM struct {
    ID        string    `gorm:"primaryKey;type:uuid"`
    Name      string    `gorm:"not null"`
    Email     string    `gorm:"uniqueIndex;not null"`
    CreatedAt time.Time `gorm:"autoCreateTime"`
}

func (UserGORM) TableName() string { return "users" }

// Repository maps between them
func (r *UserRepository) Create(ctx context.Context, user *domain.User) error {
    gormModel := UserGORM{ID: user.ID, Name: user.Name, Email: user.Email}
    return r.db.WithContext(ctx).Create(&gormModel).Error
}
```

**Trade-off:** You still need mapping code between domain ↔ GORM structs, but GORM handles nulls, timestamps, and CRUD automatically.

---

## 5. GORM Dynamic Queries

GORM is **naturally excellent** at dynamic queries:

```go
query := db.Model(&User{})

// Conditional WHERE
if nameFilter != "" {
    query = query.Where("name LIKE ?", "%"+nameFilter+"%")
}
if minAge > 0 {
    query = query.Where("age >= ?", minAge)
}

// Dynamic ORDER BY (including JSONB paths)
query = query.Order(sortField + " " + sortDir)

var users []User
err := query.Find(&users).Error
```

**Cursor pagination:** Use `gorm-cursor-paginator` (226 stars, Dec 2024, https://github.com/pilagod/gorm-cursor-paginator)

**Scopes for reusable filters:**
```go
func ActiveUsers(db *gorm.DB) *gorm.DB {
    return db.Where("active = ?", true)
}
query := db.Scopes(ActiveUsers).Find(&users)
```

---

## Sources

- https://www.bytebase.com/blog/golang-orm-query-builder/
- https://medium.com/@kemaltf_/clean-architecture-hexagonal-architecture-in-go-a-practical-guide-aca2593b7223
- https://threedots.tech/post/repository-pattern-in-go/
- https://enterprisecraftsmanship.com/posts/having-the-domain-model-separate-from-the-persistence-model/
- https://gorm.io/docs/scopes.html
