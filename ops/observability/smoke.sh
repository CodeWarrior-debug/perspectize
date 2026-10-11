#!/usr/bin/env bash
# Observability tracer smoke test. Run after `make obs-up` (via `make obs-smoke`).
#
# 1. Sends a few real, named GraphQL operations to the demo backend (one
#    anonymous, one as the seeded demo persona alice) and a synthetic Faro
#    log to the local Alloy faro.receiver.
# 2. Polls lgtm's Prometheus, Tempo and Loki APIs until each expected signal
#    shows up or the deadline passes (backend metrics export every 30s).
# 3. Prints PASS/FAIL per signal; exits non-zero if any check failed.
#
# Metric names are the Prometheus names produced by lgtm's native OTLP
# receiver (UnderscoreEscapingWithSuffixes) — mapping in .docs/OBSERVABILITY.md.
#
# Needs: bash, curl, jq (preinstalled on macOS 15+).
# Overrides: OBS_GRAPHQL_URL, OBS_FRONTEND_URL, OBS_FARO_URL, OBS_PROM_URL,
# OBS_TEMPO_URL, OBS_LOKI_URL, OBS_SMOKE_TIMEOUT (seconds), OBS_SMOKE_REQUESTS.

set -euo pipefail

GRAPHQL_URL="${OBS_GRAPHQL_URL:-http://localhost:8081/graphql}"
FRONTEND_URL="${OBS_FRONTEND_URL:-http://localhost:4173}"
FARO_URL="${OBS_FARO_URL:-http://localhost:12347/collect}"
PROM_URL="${OBS_PROM_URL:-http://localhost:9090}"
TEMPO_URL="${OBS_TEMPO_URL:-http://localhost:3200}"
LOKI_URL="${OBS_LOKI_URL:-http://localhost:3100}"
TIMEOUT="${OBS_SMOKE_TIMEOUT:-90}"
REQUESTS="${OBS_SMOKE_REQUESTS:-5}"

SERVICE="perspectize-backend"
WEB_SERVICE="perspectize-web"
CLIENT_VERSION="obs-smoke"
FARO_MARKER="obs-smoke-$(date +%s)"

for tool in curl jq; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "error: $tool is required" >&2
		exit 2
	fi
done

failures=0
pass() { printf '  PASS  %s\n' "$*"; }
fail() {
	printf '  FAIL  %s\n' "$*"
	failures=$((failures + 1))
}

# --- 1. Traffic ----------------------------------------------------------------

# Verbatim from frontend/src/lib/queries (content/index.ts, users/index.ts).
# shellcheck disable=SC2016 # $first/$filter are GraphQL variables, not shell.
LIST_COMPARABLE_CONTENT='query ListComparableContent($first: Int = 40, $filter: ContentFilter) { content(first: $first, sortBy: UPDATED_AT, sortOrder: DESC, filter: $filter, includeTotalCount: false) { items { id name contentType channelTitle url perspectiveCount } } }'
ME='query Me { me { id username role onboarding { version displayNextSession completedAt } } }'

# gql <operationName> <query> [bearer-token] -> prints the HTTP status code
gql() {
	local name=$1 query=$2 token=${3:-}
	local body
	body=$(jq -cn --arg q "$query" --arg op "$name" '{query: $q, operationName: $op, variables: {}}')
	local args=(-sS -o /dev/null -w '%{http_code}' -X POST "$GRAPHQL_URL"
		-H 'Content-Type: application/json'
		-H "X-Client-Version: $CLIENT_VERSION"
		-H 'X-Client-Platform: web'
		--data "$body")
	if [[ -n $token ]]; then
		args+=(-H "Authorization: Bearer $token")
	fi
	curl "${args[@]}" || true # -w still prints 000 on connection failure
}

echo "Traffic -> $GRAPHQL_URL ($REQUESTS x ListComparableContent, $REQUESTS x Me as demo.alice)"
traffic_ok=true
for ((i = 1; i <= REQUESTS; i++)); do
	code=$(gql ListComparableContent "$LIST_COMPARABLE_CONTENT")
	[[ $code == 200 ]] || traffic_ok=false
	code=$(gql Me "$ME" demo.alice)
	[[ $code == 200 ]] || traffic_ok=false
done
if $traffic_ok; then
	pass "GraphQL requests returned HTTP 200"
else
	fail "some GraphQL requests did not return HTTP 200 (is 'make obs-up' running?)"
fi

# Frontend: the demo image must allow the Faro collector in its CSP.
faro_origin=$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$FARO_URL")
if curl -fsS "$FRONTEND_URL/" 2>/dev/null | grep -q "connect-src[^;]*$faro_origin"; then
	pass "frontend CSP connect-src allows $faro_origin"
else
	fail "frontend at $FRONTEND_URL is down or its CSP lacks $faro_origin (rebuilt with the overlay?)"
fi

# Synthetic Faro payload (what the Web SDK POSTs) -> Alloy -> Loki.
faro_body=$(jq -cn --arg msg "$FARO_MARKER" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg app "$WEB_SERVICE" \
	'{meta: {app: {name: $app, environment: "demo"}}, logs: [{message: $msg, level: "info", timestamp: $ts}]}')
faro_code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$FARO_URL" \
	-H 'Content-Type: application/json' -H 'Origin: http://localhost:4173' \
	--data "$faro_body" || true)
if [[ $faro_code == 2* ]]; then
	pass "Alloy faro.receiver accepted a payload (HTTP $faro_code)"
else
	fail "Alloy faro.receiver at $FARO_URL returned HTTP $faro_code"
fi

# --- 2. Assertions -------------------------------------------------------------

deadline=$(($(date +%s) + TIMEOUT))

# prom_count <promql> -> number of series (0 on any error)
prom_count() {
	curl -sS -G "$PROM_URL/api/v1/query" --data-urlencode "query=$1" 2>/dev/null |
		jq -r '.data.result | length' 2>/dev/null || echo 0
}

tempo_count() {
	local now
	now=$(date +%s)
	curl -sS -G "$TEMPO_URL/api/search" \
		--data-urlencode "q={resource.service.name=\"$SERVICE\"}" \
		--data-urlencode "start=$((now - 900))" --data-urlencode "end=$((now + 60))" \
		--data-urlencode "limit=5" 2>/dev/null |
		jq -r '(.traces // []) | length' 2>/dev/null || echo 0
}

# loki_count <logql> -> number of log lines in the last 15 minutes
loki_count() {
	curl -sS -G "$LOKI_URL/loki/api/v1/query_range" \
		--data-urlencode "query=$1" --data-urlencode "since=15m" --data-urlencode "limit=5" 2>/dev/null |
		jq -r '[.data.result[]?.values[]?] | length' 2>/dev/null || echo 0
}

# await <label> <command...> : re-run the counting command until it prints a
# number >= 1 or the shared deadline passes.
await() {
	local label=$1
	shift
	local n
	while true; do
		n=$("$@")
		if [[ $n =~ ^[0-9]+$ ]] && ((n >= 1)); then
			pass "$label ($n)"
			return
		fi
		if (($(date +%s) >= deadline)); then
			fail "$label (none after ${TIMEOUT}s)"
			return
		fi
		sleep 5
	done
}

echo "Waiting up to ${TIMEOUT}s for signals (metric export interval is 30s)..."

await "metric graphql_server_operation_duration_seconds_bucket{graphql_operation_name=\"ListComparableContent\"}" \
	prom_count "graphql_server_operation_duration_seconds_bucket{job=\"$SERVICE\",graphql_operation_name=\"ListComparableContent\",graphql_operation_type=\"query\"}"
await "metric graphql_server_operation_duration_seconds_count{graphql_operation_name=\"Me\"}" \
	prom_count "graphql_server_operation_duration_seconds_count{job=\"$SERVICE\",graphql_operation_name=\"Me\"}"
await "metric app_build_info" \
	prom_count "app_build_info{job=\"$SERVICE\"}"
await "metric app_client_requests_total{client_version=\"$CLIENT_VERSION\"}" \
	prom_count "app_client_requests_total{job=\"$SERVICE\",client_version=\"$CLIENT_VERSION\",client_platform=\"web\"}"
await "metric db_client_connection_count{state=\"idle\"|\"used\"}" \
	prom_count "db_client_connection_count{job=\"$SERVICE\"}"
await "Tempo trace for service.name=$SERVICE" tempo_count
await "Loki log line for service_name=$SERVICE" \
	loki_count "{service_name=\"$SERVICE\"}"
await "Loki Faro log line for service_name=$WEB_SERVICE" \
	loki_count "{service_name=\"$WEB_SERVICE\"} |= \"$FARO_MARKER\""

# Informational: which build does app_build_info report?
build=$(curl -sS -G "$PROM_URL/api/v1/query" --data-urlencode "query=app_build_info{job=\"$SERVICE\"}" 2>/dev/null |
	jq -r '.data.result[0].metric | "service_version=\(.service_version // "?") vcs_ref_head_revision=\(.vcs_ref_head_revision // "?")"' 2>/dev/null || true)
if [[ -n $build && $build != null ]]; then
	echo "  info  app_build_info: $build"
	head_sha=$(git rev-parse HEAD 2>/dev/null || true)
	if [[ -n $head_sha && $build != *"$head_sha"* ]]; then
		echo "  info  (revision differs from local HEAD $head_sha: stack started from another commit, or not via 'make obs-up')"
	fi
fi

echo
if ((failures > 0)); then
	echo "obs-smoke: $failures check(s) FAILED"
	exit 1
fi
echo "obs-smoke: all checks passed. Grafana: http://localhost:3000"
