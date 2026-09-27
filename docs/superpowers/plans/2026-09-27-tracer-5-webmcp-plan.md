# Tracer 5: WebMCP (Jeeves's tools for the browser's own agent)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans **in the main session** (teaching mode). Steps use checkbox (`- [ ]`) syntax. Stacked on tracer 4 (`feature/jeeves-tracer-4`, PR #461). No API key is needed: the browser's agent is the model, and it pays for its own tokens.

**Goal:** When a signed-in user visits Perspectize in a browser with WebMCP (Chrome, origin trial now, stable expected around Chrome 157), the browser's built-in agent can call Jeeves's read-only tools: `read_guide` and `list_perspectives`. The page registers them through `document.modelContext.registerTool`. Each call runs on the backend through the **same registry** Jeeves uses, with the user's Clerk session, so there's one implementation, one schema check and one privacy path.

**Spec:** W3C WebMCP draft (https://webmachinelearning.github.io/webmcp/). `document.modelContext.registerTool(tool, {signal})`; the tool has `name`, `title`, `description`, `inputSchema`, `execute(input) → Promise<any>` and `annotations { readOnlyHint, untrustedContentHint, consequentialHint }`. Unregister by aborting the signal. Older Chrome builds expose `navigator.modelContext` as an alias.

**Requirements touched:** a new WebMCP surface. It supports decision 1 ("MCP later") without the remote-server OAuth work, and INAPP-06 stays the gate for any write tool.

## Global Constraints

- **Read-only.** The backend runs only allow-listed tools (`read_guide`, `list_perspectives`), whatever the registry grows to hold. Writes wait for our own confirm-to-apply UI.
- **The viewer comes from the session, never the input.** The backend binds the tool set to the signed-in user, exactly like `AskAs`.
- **Feature-detected and flagged.** The page does nothing unless `document.modelContext` (or the alias) exists **and** `VITE_WEBMCP=true`. Production stays dark.
- No `&&` chains. Backend, ai-tooling and frontend checks as usual.

## Task 1: ai-tooling, a standalone tool set

- [x] `jeeves.Tools(areas, data, viewer)` builds the registry that `Assistant.ToolsFor` uses today, so callers without a model (the backend runner) get identical tools.
- [x] `jeeves.ReadOnlyTools` names the tools safe to expose outside the agent loop.

**Learn:** *Quiz:* "Why share the registry instead of rewriting the tools in TypeScript?"

## Task 2: Backend tool runner and GraphQL

**Files:** `backend/internal/adapters/assistant/tools.go` (+ test), `backend/assistant.graphql`, resolvers, `main.go`.

- [x] `ToolRunner`: `Specs()` lists the allow-listed tools; `Run(ctx, userID, name, inputJSON)` builds the viewer-bound registry and calls the tool. Unknown or non-allow-listed names are rejected. Schema validation is the registry's. It needs no API key, so it's wired whenever the guide loads, independent of `JEEVES_ENABLED`, behind its own `WEBMCP_ENABLED` flag.
- [x] GraphQL: `assistantTools: [AssistantToolSpec!]! @auth` (name, description, inputSchema as a JSON string, readOnly, untrustedContent) and `runAssistantTool(name: String!, input: String!): String! @auth`. It's a query, since tools are read-only.
- [x] Tests: allow-list, viewer binding (user 1 never gets user 2's private rows), bad input returns a GraphQL error, disabled returns a clear error.

## Task 3: Frontend registration

**Files:** `frontend/src/lib/assistant/webmcp.ts` (+ test), layout mount.

- [x] `registerWebMCP(request)`: feature-detect, fetch `assistantTools`, register each with `execute` that calls `runAssistantTool` through `graphqlRequest` (Clerk token attached), with `annotations.readOnlyHint` and `untrustedContentHint` from the spec. It returns a cleanup that aborts the signal.
- [x] Mount it in the signed-in layout behind `VITE_WEBMCP`, cleaned up on sign-out or unmount.
- [x] Tests with a fake `modelContext`: no-op without WebMCP, registers every listed tool, execute round-trips through the request function, cleanup aborts, and the `navigator` alias is supported.

## Task 4: Live checkpoint (owner, local)

- [ ] Chrome with the WebMCP flag or origin trial, `VITE_WEBMCP=true` and `WEBMCP_ENABLED=true`. Sign in and ask the browser's agent "What have I rated highest on Perspectize?". It should call `list_perspectives`.

## Notes (recorded at code-complete)

- **Error hygiene fix found on the way:** the backend data adapter used to wrap raw database errors into tool results, which reach the model and, through WebMCP, the browser's agent. It now logs the real error and returns a plain message. A test asserts no backend detail leaks.
- **Resolver field is `ToolRunner`**, not `AssistantTools`. gqlgen's generated `AssistantTools` query method shadows a same-named field on the embedded `*Resolver`.
- **Stray `schema.resolvers.go` again:** it had 0 stubs and was deleted, per the backend CLAUDE.md gotcha. The new stubs landed in `assistant.resolvers.go`.
- **`jeeves.ReadOnlyTools` is the gate** for every external surface. A test fails if a new tool is added to `jeeves.Tools` without being classified.

