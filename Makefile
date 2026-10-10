# Perspectize — root dev orchestration.
# Starts/stops the backend (:8080, air hot-reload) and frontend (:5173, vite)
# dev servers detached, so `make start` returns and `make stop` cleans up later.
#
# The database is remote (Sevalla) — nothing to start locally for it.

.PHONY: start stop restart status logs help demo-up demo-down demo-reset demo-wipe demo-logs demo-test demo-record obs-up obs-down obs-smoke
.DEFAULT_GOAL := help

BACKEND_PORT  := 8080
FRONTEND_PORT := 5173
PID_DIR := .dev
LOG_DIR := logs

help:
	@echo "Perspectize dev servers:"
	@echo "  make start    - start backend (:$(BACKEND_PORT)) + frontend (:$(FRONTEND_PORT)) detached"
	@echo "  make stop     - stop both"
	@echo "  make restart  - stop then start"
	@echo "  make status   - show what's listening on :$(BACKEND_PORT) / :$(FRONTEND_PORT)"
	@echo "  make logs     - tail -f $(LOG_DIR)/*.log"
	@echo ""
	@echo "Demo stack (Docker; see docker-compose.demo.yml):"
	@echo "  make demo-up      - build + start at http://localhost:4173 (persistent, seeded)"
	@echo "  make demo-reset   - restore demo-persona data to the pristine seed"
	@echo "  make demo-test    - reset, then run tours + flows as Playwright E2E"
	@echo "  make demo-record  - reset, then record tours to frontend/demo/out/videos/"
	@echo "  make demo-down    - stop (keeps data)  |  make demo-wipe - stop + delete data"
	@echo ""
	@echo "Observability tracer (demo stack + local Grafana LGTM; see .docs/OBSERVABILITY.md):"
	@echo "  make obs-up       - demo stack + lgtm + alloy, telemetry on; Grafana http://localhost:3000"
	@echo "  make obs-smoke    - send GraphQL traffic, assert metrics/traces/logs reached Grafana"
	@echo "  make obs-down     - stop demo + observability containers (demo data kept)"

start:
	@mkdir -p $(PID_DIR) $(LOG_DIR)
	@test -f backend/.env  || echo "warning: backend/.env missing (copy backend/.env.example)"
	@test -f frontend/.env || echo "warning: frontend/.env missing (copy frontend/.env.example)"
	@if lsof -ti tcp:$(BACKEND_PORT) >/dev/null 2>&1; then \
		echo "backend: already listening on :$(BACKEND_PORT), skipping"; \
	else \
		nohup sh -c 'cd backend && exec go tool air' > $(LOG_DIR)/backend.log 2>&1 & echo $$! > $(PID_DIR)/backend.pid; \
		echo "backend: started (pid $$(cat $(PID_DIR)/backend.pid)), log $(LOG_DIR)/backend.log"; \
	fi
	@if lsof -ti tcp:$(FRONTEND_PORT) >/dev/null 2>&1; then \
		echo "frontend: already listening on :$(FRONTEND_PORT), skipping"; \
	else \
		nohup pnpm --dir frontend run dev > $(LOG_DIR)/frontend.log 2>&1 & echo $$! > $(PID_DIR)/frontend.pid; \
		echo "frontend: started (pid $$(cat $(PID_DIR)/frontend.pid)), log $(LOG_DIR)/frontend.log"; \
	fi
	@echo "Run 'make logs' to follow output, 'make stop' to shut down."

stop:
	@for name in backend frontend; do \
		if [ -f $(PID_DIR)/$$name.pid ]; then \
			pid=$$(cat $(PID_DIR)/$$name.pid); \
			if kill $$pid 2>/dev/null; then echo "$$name: sent TERM to pid $$pid"; fi; \
			rm -f $(PID_DIR)/$$name.pid; \
		fi; \
	done
	@sleep 1
	@# Fallbacks — air/pnpm spawn children that may outlive the parent pid.
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
		pids=$$(lsof -ti tcp:$$port 2>/dev/null); \
		if [ -n "$$pids" ]; then echo "port $$port: killing $$pids"; kill $$pids 2>/dev/null || true; fi; \
	done
	@pkill -f 'go tool air' 2>/dev/null || true
	@pkill -f 'backend/tmp/main' 2>/dev/null || true
	@pkill -f 'vite dev' 2>/dev/null || true
	@echo "stopped."

restart: stop start

status:
	@echo "backend  :$(BACKEND_PORT) ->"; lsof -i tcp:$(BACKEND_PORT) -sTCP:LISTEN 2>/dev/null || echo "  (not running)"
	@echo "frontend :$(FRONTEND_PORT) ->"; lsof -i tcp:$(FRONTEND_PORT) -sTCP:LISTEN 2>/dev/null || echo "  (not running)"

logs:
	@tail -f $(LOG_DIR)/backend.log $(LOG_DIR)/frontend.log

# --- Demo stack -------------------------------------------------------------
# Persistent Postgres + seeded personas + DEMO_MODE backend + demo frontend.
# Playwright runs on the host against it: needs `pnpm install` in frontend/
# and a Chromium (`pnpm --dir frontend exec playwright install chromium`).
DEMO_COMPOSE := docker compose -f docker-compose.demo.yml
DEMO_ENV := DEMO_BASE_URL=http://localhost:4173 DEMO_GRAPHQL_URL=http://localhost:8081/graphql

demo-up:
	$(DEMO_COMPOSE) up -d --build --wait backend frontend
	@echo "Demo: http://localhost:4173  (API http://localhost:8081/graphql, Postgres localhost:5434 demo/demo)"

demo-down:
	$(DEMO_COMPOSE) down

demo-wipe:
	$(DEMO_COMPOSE) down -v

demo-logs:
	$(DEMO_COMPOSE) logs -f backend

demo-reset:
	$(DEMO_COMPOSE) run --rm seed -reset

demo-test: demo-reset
	$(DEMO_ENV) pnpm --dir frontend run demo:test

demo-record: demo-reset
	$(DEMO_ENV) pnpm --dir frontend run demo:record
	@echo "Videos: frontend/demo/out/videos/*.webm"

# --- Observability tracer ---------------------------------------------------
# The demo stack plus docker-compose.observability.yml: grafana/otel-lgtm
# (Grafana/Prometheus/Tempo/Loki) and Alloy (Faro receiver), with the backend's
# OTLP export and the frontend's Faro SDK switched on. Same compose project as
# the demo stack, so stop it with obs-down (demo-down would leave lgtm/alloy
# running as orphans). Runbook: .docs/OBSERVABILITY.md.
OBS_COMPOSE := docker compose -f docker-compose.demo.yml -f docker-compose.observability.yml

obs-up:
	GIT_COMMIT=$$(git rev-parse HEAD) GIT_BRANCH=$$(git rev-parse --abbrev-ref HEAD) \
		$(OBS_COMPOSE) up -d --build --wait backend frontend alloy lgtm
	@echo "Grafana: http://localhost:3000  (dashboard: Perspectize / Perspectize API; anonymous admin)"
	@echo "Demo:    http://localhost:4173  (API http://localhost:8081/graphql, Faro -> http://localhost:12347/collect)"
	@echo "Next:    make obs-smoke"

obs-down:
	$(OBS_COMPOSE) down

obs-smoke:
	bash ops/observability/smoke.sh
