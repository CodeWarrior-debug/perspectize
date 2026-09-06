# Perspectize — root dev orchestration.
# Starts/stops the backend (:8080, air hot-reload) and frontend (:5173, vite)
# dev servers detached, so `make start` returns and `make stop` cleans up later.
#
# The database is remote (Sevalla) — nothing to start locally for it.

.PHONY: start stop restart status logs help
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
