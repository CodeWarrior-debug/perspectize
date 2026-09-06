#!/bin/bash
# PreToolUse hook (Bash) — blocks any Bash command that references a real `.env`
# file, unless the command is a known safe metadata/lifecycle operation.
#
# The Read tool is already blocked for these paths via permissions.deny in
# settings.json; this hook is the Bash backstop, since the allow-list grants
# broad access to cat/grep/sed/awk/etc.
#
# Policy: secret VALUES live only in gitignored `.env*` files and are entered by
# humans. Agents read `.env.example` (names + comments) instead. See
# .docs/SECURITY.md.
#
# Design: deny-by-default when a disallowed `.env` path is mentioned. It is far
# more robust to allow-list the handful of safe operations than to enumerate
# every possible read/exfil command. A false positive is recoverable (approve
# once, or widen the SAFE list below); a false negative leaks a secret.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')
[ -z "$command" ] && exit 0

# Extract every path-like token that ends in `.env` or `.env.<suffix>`.
env_refs=$(echo "$command" \
  | grep -oiE '([./a-z0-9_~-]*/)?\.env([.][a-z0-9_-]+)?' \
  | grep -ivE '\.env\.(example|test)$')

# No reference to a protected .env file -> nothing to do.
[ -z "$env_refs" ] && exit 0

# Safe operations: the ONLY commands permitted to name a protected .env file.
# Anchored at start-of-segment / after a shell separator.
SAFE='test|\[|ls|stat|file|find|realpath|basename|dirname|du|rm|unlink|touch|mkdir|chmod|chown|git|diff|cmp|mktemp'

# Split on shell separators; each segment must be a safe op or we deny.
segments=$(echo "$command" | sed -E 's/\&\&|\|\||[;|]/\n/g' | tr '\n' '\n')

verdict_deny=0
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"   # ltrim
  [ -z "$seg" ] && continue
  echo "$seg" | grep -oiE '([./a-z0-9_~-]*/)?\.env([.][a-z0-9_-]+)?' \
    | grep -qivE '\.env\.(example|test)$' || continue   # no protected ref here

  # `cp SRC .env` / `mv SRC .env` are OK only when the protected .env is the
  # DESTINATION (last token) — i.e. writing a fresh env file, not reading one.
  # Strip a trailing .env destination, then see if a protected ref remains.
  if echo "$seg" | grep -qiE '^(cp|mv|install)[[:space:]]'; then
    head=$(echo "$seg" | sed -E 's/[[:space:]]+([./a-z0-9_~-]*\/)?\.env([.][a-z0-9_-]+)?[[:space:]]*$//')
    if ! echo "$head" | grep -oiE '([./a-z0-9_~-]*/)?\.env([.][a-z0-9_-]+)?' \
         | grep -qivE '\.env\.(example|test)$'; then
      continue
    fi
  fi

  if echo "$seg" | grep -qiE "^($SAFE)([[:space:]]|\$)"; then
    continue
  fi

  verdict_deny=1
  break
done <<< "$segments"

[ "$verdict_deny" -eq 0 ] && exit 0

REASON='Blocked: this command references a protected .env file.

Secret VALUES are entered by humans only and are never surfaced to the agent.
Read backend/.env.example / frontend/.env.example for the list of variables and
what each is for. See .docs/SECURITY.md.

If this was a genuine non-read operation (e.g. checking existence), the hook is
being conservative — run a narrower command or ask the user to approve.'

jq -n --arg reason "$REASON" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}'
exit 0
