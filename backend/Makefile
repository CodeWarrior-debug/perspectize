.PHONY: build run dev test docker-up docker-down clean migrate-up migrate-up-n migrate-down migrate-down-n migrate-create graphql-gen fmt lint test-coverage test-duplication install-hooks mutate mutate-diff

# Load .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

# Database connection: prefer DATABASE_URL from .env, fall back to local default
DB_URL ?= $(or $(DATABASE_URL),postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable)

build:
	go build -o bin/perspectize-server cmd/server/main.go

run:
	go run cmd/server/main.go

dev:
	go tool air

test:
	go test -v -cover -coverpkg=./internal/...,./pkg/... ./...

docker-up:
	docker-compose up -d
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f postgres

# Migration commands
migrate-up:
	# Usage: make migrate-up
	@echo "Running all pending migrations..."
	migrate -path migrations -database "$(DB_URL)" up

migrate-up-n:
	# Usage: make migrate-up-n N=1
	@echo "Running $(N) migration(s)..."
	migrate -path migrations -database "$(DB_URL)" up $(N)

migrate-down:
	# Usage: make migrate-down
	@echo "Rolling back last migration..."
	migrate -path migrations -database "$(DB_URL)" down 1

migrate-down-n:
	# Usage: make migrate-down-n N=2
	@echo "Rolling back $(N) migration(s)..."
	migrate -path migrations -database "$(DB_URL)" down $(N)

migrate-create:
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir migrations -seq $$name

migrate-version:
	migrate -path migrations -database "$(DB_URL)" version

migrate-force:
	@read -p "Enter version to force: " version; \
	migrate -path migrations -database "$(DB_URL)" force $$version

clean:
	rm -rf bin/
	docker-compose down -v

# GraphQL code generation
graphql-gen:
	@echo "Generating GraphQL code..."
	go run github.com/99designs/gqlgen generate

# Code formatting
fmt:
	go fmt ./...

# Linting (requires golangci-lint)
lint:
	golangci-lint run ./...

# Install git hooks (shared hooks in repo root .hooks/)
install-hooks:
	git config core.hooksPath .hooks
	@echo "Git hooks installed (.hooks/pre-commit)"

# Test duplication detection (requires jscpd: npm install -g jscpd)
test-duplication:
	jscpd .

# Test with coverage report
test-coverage:
	go test -v -coverpkg=./internal/...,./pkg/... -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Mutation testing (requires gremlins: go install github.com/go-gremlins/gremlins/cmd/gremlins@v0.6.0).
# Config lives in .gremlins.yaml. GOFLAGS=-count=1 bypasses the go test cache so the coverage
# baseline Gremlins derives its per-mutant timeout from reflects a real suite run.
# Full run (slow — every mutant runs the whole suite): make mutate
mutate:
	GOFLAGS=-count=1 gremlins unleash .

# Only mutate lines changed vs origin/main (what CI runs on PRs): make mutate-diff
mutate-diff:
	GOFLAGS=-count=1 gremlins unleash --diff origin/main .
