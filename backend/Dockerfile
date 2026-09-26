# Build context is the REPO ROOT, not backend/ (Sevalla: Docker context ".",
# Dockerfile path "backend/Dockerfile"). The backend imports the sibling
# ai-tooling module through a `replace ../ai-tooling` directive, so both
# directories must be inside the context. What gets in is controlled by the
# deny-by-default root .dockerignore; only backend/ and ai-tooling/ are copied.

# Build stage
FROM golang:1.27-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Dependencies first (layer caching). ai-tooling's go.mod/go.sum are needed
# once backend requires it via the replace directive.
COPY backend/go.mod backend/go.sum ./backend/
COPY ai-tooling/go.mod ai-tooling/go.sum ./ai-tooling/
WORKDIR /app/backend
RUN go mod download

# Sources: never `COPY . .` from the repo root (that would pull in frontend/
# and anything the ignore file misses).
WORKDIR /app
COPY backend ./backend
COPY ai-tooling ./ai-tooling

# Build static binary
WORKDIR /app/backend
RUN CGO_ENABLED=0 GOOS=linux GOFLAGS="-trimpath" go build -ldflags="-s -w" -o /app/server ./cmd/server

# Runtime stage — hardened minimal image
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /app/server /server
COPY --from=builder /app/backend/migrations /migrations

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/server"]
