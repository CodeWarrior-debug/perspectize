# Feature Research

**Domain:** In-app AI assistant ("Jeevesbot") for a calm, user-in-control perspective platform — how-to help assistant + content-refinement assistant
**Researched:** 2026-09-26
**Confidence:** MEDIUM (UX conventions cross-checked across several 2026 pattern libraries and accessibility write-ups; no Context7 source applies to UX conventions; locked decisions taken from `ai-tooling/CLAUDE.md` and not re-litigated)

> Scope: only the NEW v1.2 features. Locked decisions (in-app first, Go agent loop, GraphQL-subscription streaming with batched deltas, per-page tool sets, "Jeevesbot" renamable, provider-neutral core, evals first-class, progressive milestone) are treated as given.

## How in-app assistants work in 2026 (context)

By 2026 an embedded assistant is a side panel (or sheet on mobile) with: streamed replies, a visible Stop control, visible tool activity ("Looking at your perspectives..."), grounded answers with citations to the source (help article / guide entry), and a human-in-the-loop gate for anything that writes. The HITL convention is a **ladder**: suggest → confirm (draft card with explicit Apply) → execute, with the approval card showing the exact payload/diff ("an approval card that hides the payload is theater"). Pattern libraries list as anti-patterns: no stop control while streaming, silent auto-apply with buried undo, approval UI that doesn't show the payload, approval after the side effect, fake completion, and cheerful failure copy that hides a real limit/permission problem. Help assistants that answer from a knowledge base are expected to cite, and to say "I don't know / that isn't something Perspectize does" rather than invent UI. Content-refinement assistants are expected to preserve the user's voice and ownership; research in 2026 (CHI long-run study, Springer AI & Society) shows sycophancy rises with user context and degrades the quality of collaborative work — directly relevant to "help refine my perspective".

This maps cleanly onto the project's capability ladder (Tell → Look → Do-with-confirmation → maybe autonomous) and the calm/anti-social-media core value.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these makes the assistant feel broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Sidebar panel, opened on demand** (sheet/drawer on mobile ≤ md) | Standard placement for embedded copilots; keeps the page visible so answers can reference it | MEDIUM | Open via an explicit header button + keyboard shortcut. Never auto-opens. Must coexist with existing dialogs (SettingsDialog, PerspectivePopover, AddVideoDialog) — decide z-order/focus behavior. UI placement is an open decision in ai-tooling/CLAUDE.md. |
| **Streaming responses** | Perceived latency; users now read a non-streaming reply as "hung" | MEDIUM | Locked: GraphQL subscription, batched text deltas. Render markdown incrementally but safely (reuse `SafeHtml` sanitization; no raw HTML from model). Show a "thinking/working" state before first token. |
| **Stop / cancel generation** | Named anti-pattern if absent; user-in-control value | MEDIUM | Stop = unsubscribe → backend must cancel the context and stop the provider stream (not just hide output), else tokens still bill. Keep the partial reply, marked "Stopped". Esc key should stop when focus is in the panel. |
| **Visible tool activity** | Users trust what they can see; also explains latency | LOW–MEDIUM | Short human labels per tool event ("Reading your perspective on *X*", "Searching the guide"). Collapsible detail. Needs tool-start/tool-end events in the provider-neutral event type. |
| **Grounded how-to answers with guide citations** | Help assistants are expected to cite; Perplexity-era baseline | MEDIUM | Each answer links to the guide entry/entries used (title + anchor). Guide must be task-oriented and have stable IDs/anchors. Citation = a link the user can open, ideally a guide page/route or an in-panel expandable. Evals should check "cited entry actually exists and supports the answer". |
| **Honest "I don't know" / "Perspectize doesn't do that"** | Fabricated features are the #1 trust-killer for help bots | MEDIUM | System prompt + eval cases for out-of-guide questions (e.g., "how do I follow someone?" → no such feature). Offer the nearest real feature or the feedback route. Deterministic eval: answer must not name UI elements absent from the guide. |
| **Page context awareness** | Users expect "this page" questions to work | MEDIUM | Locked per-page tool sets. Also pass lightweight page context (route, selected content ID, open perspective ID). Show a small "Context: Compare page — *Video title*" chip so the user knows what the assistant can see. |
| **Privacy-respecting reads** | Users assume the bot can't leak private perspectives | MEDIUM | Tools must go through services that enforce `RestrictToPublicOrOwner` (domain already has `PrivacyPublic`/`PrivacyPrivate`). Never read other users' PRIVATE perspectives or messages. Eval fixture with a private perspective owned by another user. |
| **Confirm-to-apply card for any write** | HITL convention; silent writes violate user control | HIGH | Card shows: action name, target (which perspective/field), exact before→after diff, Apply + Dismiss as co-equal buttons, and optional "Edit before applying". Apply triggers the normal authenticated mutation from the client (or a server-side pending-action token that expires) — never a write inside the agent loop without the click. Show success/failure truthfully after apply; card becomes read-only ("Applied" / "Dismissed"). |
| **Undo after apply** | Pairs with confirm; cheap reassurance | MEDIUM | For perspective edits, keep the pre-apply snapshot client-side and offer "Undo" for the session. Autosave/versioning not required. |
| **New conversation / reset** | Every chat product has it; context rot and cost | LOW | "New chat" button clears thread. Clear expectation copy: what's kept (nothing, or last N threads). |
| **Conversation persistence within a session** | Navigating pages shouldn't wipe the chat | LOW–MEDIUM | Keep the thread in a store across SvelteKit navigation (static adapter, client-side routing makes this easy). Server-side history is a separate, optional decision (see Differentiators/Deferred). |
| **Usage limits with clear, calm messaging** | Rate limits are unavoidable; opaque failures feel broken | MEDIUM | Say what happened, when it resets, and what still works ("You've used today's 30 messages. Resets at 00:00 UTC. The app guide is still available here: ..."). Show remaining quota subtly (e.g., only when < 20%). Never "Something went wrong" for a limit. Distinguish: user limit, global/provider outage, content-policy refusal. Existing backend rate-limiting infra can be extended. |
| **Error + retry** | Streams drop (WebSocket reconnects, provider 529/overload) | MEDIUM | Inline error on the failed message with Retry; keep partial text. Don't double-charge quota on provider-side failures. |
| **Accessibility baseline** | WCAG 2.2 AA expected; sidebar chats are a known a11y gap | MEDIUM | Panel is a labelled `complementary` region or non-modal dialog; focus moves into the input on open and returns to the trigger on close. Streaming text is NOT put in an aggressive live region token-by-token (causes re-announcement storms / dropped updates in NVDA/JAWS/VoiceOver). Instead: polite status "Jeevesbot is responding", then announce the completed message (or per completed sentence). Stop, Apply, Dismiss, Copy are real `<button>`s with labels. Respect `prefers-reduced-motion` (no typing-cursor animation). Message list uses `role="log"` semantics. Full keyboard operation. Color tokens from the theme system (no raw hex — pre-commit hook enforces). |
| **Assistant naming (default "Jeevesbot", renamable)** | Locked decision; rename lives in Settings | LOW | Rename in existing `SettingsDialog`; persist per user. Validate length/charset; name is display-only and must not change the system prompt's safety rules or impersonate a real person/other users. Code stays `assistant`. Trademark check before launch (locked). |
| **Copy response** | Universal convenience | LOW | Copy button per assistant message (plain text/markdown). |
| **Clear AI disclosure** | Users need to know content is machine-generated; also emerging regulation (EU AI Act transparency obligations) | LOW | Label assistant messages, and label any text the user applies ("Drafted with Jeevesbot" is optional metadata, not a public badge — see Anti-Features). |

### Differentiators (Competitive Advantage)

Aligned with "calm, user in control" and "refine perspectives".

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Refinement as questions, not rewrites** ("Socratic" mode default) | Keeps the perspective the user's own; counters sycophancy and homogenized voice | MEDIUM | Default refine behavior: point out ambiguity, unsupported claims, missing reasons, rating/text mismatch (e.g., quality 900 but review is negative), and ask questions. Rewrites only on explicit request, always via confirm card with diff. Prompt + evals, not new infra. |
| **Anti-sycophancy stance by design** | Honest feedback is rare and valuable; research shows sycophancy lowers work quality | MEDIUM | Prompt rules: don't praise by default, don't flip assessments when the user pushes back without new reasons, state disagreements plainly and kindly. Eval: "pushback" cases where the correct answer is to hold position. |
| **Butler persona: brief, polite, unobtrusive** | Fits the Jeeves concept and the calm brand; differentiates from chirpy chatbots | LOW | Short answers by default, no emoji, no exclamation spam, no "Great question!". Offers one next step, not five. Persona must never override honesty or safety. |
| **Steelman / challenge mode (opt-in)** | From backlog: strengthen thinking by presenting the best counter-view, optionally using others' public perspectives | MEDIUM | Uses read-only tools over public perspectives on the same content. Must attribute ("@user's public take argues...") and never quote private data. Explicit user trigger only. |
| **Summarize the range of public perspectives on this content** | High value on Compare/Discover; calm overview instead of feeds | MEDIUM | Read-only tool. Must represent distribution fairly (counts, not cherry-picks), cite which perspectives were used. Watch token cost on popular content — paginate/sample with disclosure. |
| **"Show me where" deep links in how-to answers** | Beyond citing: jump to the right page/control | MEDIUM | Answer can include an app link (route + optional highlight of the control). Highlight only on click. Requires guide entries to carry route + element anchors. |
| **Inline field-level suggestions via confirm cards** (e.g., propose a category, a clearer claim, a custom field value) | Makes Level 3 ("do with confirmation") concrete and low-risk | HIGH | Each card targets one field; batch "Apply all" only after individual cards work. Relies on PerspectiveEditor field model and existing mutations. |
| **Transparent "what I can see" panel** | Rare, trust-building; matches user-in-control | LOW | One expandable line listing the tools available on this page and the data they touch. Falls out of per-page tool sets. |
| **User controls over assistant behavior in Settings** | Control = core value | LOW–MEDIUM | Toggles: rename, response length (brief/detailed), "Never draft text for me" (questions only), disable assistant entirely (hide the button). |
| **Server-side conversation history (opt-in, deletable)** | Continuity across devices | MEDIUM | Defer unless demanded; if built, retention limit + "Delete all history". Adds privacy surface. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Proactive nudges / pop-ups** ("Want help with that perspective?", auto-open on page load, badge counts) | Drives engagement metrics | Directly violates "never interrupted"; the social-media pattern this product rejects | Assistant only speaks when spoken to. At most a static, dismissible hint in onboarding, shown once. |
| **Silent writes / auto-apply** | Faster; "agentic" | Breaks user control; named HITL anti-pattern; hard to trust or audit | Confirm card with diff for every write in v1.2. Autonomous actions (ladder step 4) only later, only reversible, only opt-in per action type, with an activity log. |
| **Sycophantic praise and agreement** | Feels nice; boosts short-term satisfaction | Degrades perspective quality; users lose trust when they notice; research-backed harm | Honest, kind, specific feedback; evals for pushback. |
| **Fabricated features / UI** | Model fills gaps plausibly | Users waste time hunting for buttons that don't exist; top trust killer | Guide-grounded answers, citations, explicit "not a feature", eval checks for unknown UI names. Keep guide verified against frontend code. |
| **Full ghost-writing of perspectives** ("Write my review for me") | Low effort | Perspectives stop being the user's own; homogenized voice; undermines the platform's purpose | Offer outline/questions; if the user insists, draft goes through confirm card and remains editable. Consider a per-user "questions only" setting. |
| **Public "AI-written" badges on perspectives** | Transparency | Stigmatizes users, invites policing — a social dynamic the product avoids | Keep AI-assist metadata private to the author (optional). |
| **Engagement-maximizing personality** (streaks, emojis, jokes, follow-up question after every answer) | "Delight" | Noisy, not calm; trains dependency | Brief butler tone; end when the question is answered. |
| **Reading others' private data or messages** | "Smarter" context | Privacy violation; legal/ethical risk | Tools enforce public-or-owner; messaging is out of scope for tools in v1.2. |
| **Content recommendations pushed into the feed** ("Based on your perspectives...") | Backlog idea; engagement | Recommendation feeds are a social-media pattern; privacy of inferred interests | Only answer when asked ("find me videos like this") in a later phase. |
| **Unlimited free usage** | Friction-free | Cost blowups; abuse | Per-user daily limits with calm messaging; free vs Pro is an open decision. |
| **One global "always allow" for actions** | Fewer clicks | Named HITL anti-pattern; riskier actions ride along | Per-action-type permissions if/when autonomy arrives. |
| **Voice input, multi-modal uploads, image generation** | Trendy | Scope creep; no core-value link | Out of scope for v1.2. |
| **Cheerful vague errors** ("Oops! Something went wrong 🙃") | Friendly | Masks limits/permissions; users can't act | Plain statement of cause + reset time + what still works. |

## Feature Dependencies

```
App guide (task-oriented, stable IDs/anchors, verified vs frontend)
    └──required by──> Grounded how-to answers ──> Guide citations ──> "Show me where" deep links
                                             └──> Honest "not a feature" (evals need guide as ground truth)

ai-tooling core (event types incl. text-delta, tool-start/end, error, done)
    └──required by──> Streaming (GraphQL subscription) ──> Stop/cancel (ctx cancel end-to-end)
                                                     └──> Visible tool activity
                                                     └──> Accessible announcements (needs "done" event)

PerspectizeData read tools (enforce RestrictToPublicOrOwner)
    └──required by──> Refine-my-perspective (Look) ──> Challenge/steelman, Summarize range
    └──required by──> Confirm-to-apply cards (need current value to diff)

Existing PerspectiveEditor + perspective mutations + Clerk auth
    └──required by──> Confirm-to-apply ──> Undo ──> (later) autonomous low-risk actions

Existing SettingsDialog + user record ──> Assistant rename, behavior toggles
Existing backend rate limiting + usage logging ──> Usage limits + limit messaging
Existing WebSocket transport (messaging) ──> Subscription streaming
Per-page tool sets ──enhances──> Page context chip, "What I can see" panel
Evals (fixtures, deterministic checks) ──gates──> each ladder step and OpenRouter pivot

Proactive nudges ──conflicts──> calm/user-in-control core value
Silent writes ──conflicts──> Confirm-to-apply model
Ghost-writing default ──conflicts──> Socratic refinement default
```

### Dependency Notes

- **Guide before assistant UI:** the "Tell" rung is only as good as the guide; citations and hallucination evals need guide entries with stable IDs. Build/verify the guide in the same phase as (or before) the first chat surface.
- **Stop requires backend cancellation:** frontend unsubscribe must propagate to `context.Context` cancel in the agent loop and provider stream; otherwise Stop is cosmetic and quota/tokens still burn.
- **Confirm-to-apply requires read tools:** a diff needs the current value, so "Look" precedes "Do". Apply should reuse existing authenticated mutations (owner checks, `@owner` directives) so the assistant never gets a privileged write path.
- **Privacy enforcement lives in services, not prompts:** in-process `PerspectizeData` must call services that apply `RestrictToPublicOrOwner`; the fixtures implementation needs a private-perspective case to test it.
- **Rename depends on Settings persistence** (user-level field) — small backend migration; follow repo migration rules (write + review only, manual apply).
- **Accessibility depends on event granularity:** announcing "responding" and "complete" requires explicit start/done events, which the provider-neutral event model should include from day one.

## MVP Definition

### Launch With (v1.2 in-app, "Tell" + "Look")

- [ ] Sidebar/sheet panel, explicit open only — core surface
- [ ] Streaming with Stop (real backend cancel), partial-reply retention — table stakes
- [ ] Guide-grounded how-to answers with citations and honest "not a feature" — the Tell rung
- [ ] Read-only tools with privacy enforcement + visible tool activity + page context chip — the Look rung
- [ ] Refine-my-perspective in Socratic/questions-first mode, anti-sycophancy prompt + evals — core differentiator, zero write risk
- [ ] New chat/reset, session-persistent thread across navigation — table stakes
- [ ] Per-user daily limit with calm, specific messaging; error + retry — cost safety
- [ ] Accessibility baseline (focus management, paced announcements, keyboard, reduced motion) — non-negotiable
- [ ] Default name "Jeevesbot" + rename in Settings — locked decision, low cost

### Add After Validation (v1.2 later phase, "Do with confirmation")

- [ ] Confirm-to-apply cards with diff, Edit-before-apply, truthful result, session Undo — trigger: Look rung evals stable and refine mode used
- [ ] Summarize the range of public perspectives / steelman mode — trigger: read tools proven on privacy fixtures
- [ ] "Show me where" deep links with on-click highlight — trigger: guide has route/element anchors
- [ ] Behavior toggles in Settings (brevity, questions-only, disable assistant)

### Future Consideration (v2+)

- [ ] Autonomous low-risk actions (opt-in per action type, reversible, activity log) — needs trust data from confirm-card usage
- [ ] Server-side, deletable conversation history — privacy surface; wait for demand
- [ ] On-request content discovery ("find videos like this") — must stay pull, not push
- [ ] Usage ledger/credits, BYOK — explicitly deferred in PROJECT.md

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming + Stop | HIGH | MEDIUM | P1 |
| Guide-grounded answers + citations | HIGH | MEDIUM | P1 |
| Honest "not a feature" | HIGH | LOW (prompt+evals) | P1 |
| Sidebar panel (explicit open) | HIGH | MEDIUM | P1 |
| Privacy-respecting read tools + tool activity | HIGH | MEDIUM | P1 |
| Socratic refine + anti-sycophancy | HIGH | MEDIUM | P1 |
| Usage limits + messaging | MEDIUM | MEDIUM | P1 |
| Accessibility baseline | HIGH | MEDIUM | P1 |
| New chat / session persistence | MEDIUM | LOW | P1 |
| Rename in Settings | LOW–MEDIUM | LOW | P1 (locked) |
| Confirm-to-apply + Undo | HIGH | HIGH | P2 |
| Summarize range / steelman | MEDIUM | MEDIUM | P2 |
| Deep links "show me where" | MEDIUM | MEDIUM | P2 |
| Behavior toggles | MEDIUM | LOW | P2 |
| "What I can see" panel | MEDIUM | LOW | P2 |
| Server-side history | LOW–MEDIUM | MEDIUM | P3 |
| Autonomous actions | MEDIUM | HIGH | P3 |

## Competitor Feature Analysis

(From 2026 pattern libraries and training knowledge of these products — MEDIUM/LOW confidence on specifics of any single product.)

| Feature | Help-center bots (Intercom Fin, docs assistants) | Writing/workspace copilots (Notion AI, Google Docs Gemini, GitHub Copilot Chat) | Our Approach |
|---------|------------------------------|-------------------------------------------|--------------|
| Grounding | Answers from knowledge base, cites articles, hands off when unsure | Grounded in current doc/workspace | Grounded in verified app guide; cite entries; "not a feature" instead of handoff (no support team) |
| Writes | Fin 2+ performs actions for customers | Draft-then-insert/replace cards; Gemini-style native Send card | Confirm card with explicit diff, Apply/Dismiss co-equal, Undo |
| Proactivity | Often proactive widgets/pop-ups | Inline sparkle prompts, suggestions | None — speak only when asked |
| Persona | Branded, friendly | Neutral | Butler: brief, polite, renamable |
| Refinement stance | n/a | Rewrite-first ("improve writing") | Questions-first; rewrite only on request |
| Streaming/stop/tool visibility | Common | Standard | Standard, plus a11y-paced announcements |

## Sources

- [AI UX Playground — Human-in-the-loop guide (2026)](https://aiuxplayground.com/guides/how-to-design-human-in-the-loop/) — approval-card rules and named anti-patterns (MEDIUM)
- [AI UX Playground — Streaming pattern](https://www.aiuxplayground.com/pattern/streaming/) (MEDIUM)
- [thefrontkit — AI Chat UI Best Practices for 2026](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) — stop button, citations, visible tool calls (MEDIUM)
- [ai-tldr.dev — Chatbot UX patterns: streaming, errors, citations](https://ai-tldr.dev/learn/building-ai-apps/ai-ux-patterns/chatbot-ux-patterns/) (LOW–MEDIUM)
- [Setproduct — Designing AI chat interfaces](https://www.setproduct.com/blog/ai-chat-interface-ui-design) (LOW–MEDIUM)
- [TianPan — The accessibility gap in AI interfaces (2026-04)](https://tianpan.co/blog/2026/04/17/ai-accessibility-streaming-screen-readers) — live-region storms, paced announcements (MEDIUM, consistent with ARIA semantics)
- [Orange digital accessibility guidelines — chatbot](https://a11y-guidelines.orange.com/en/articles/chatbot/) (MEDIUM)
- [accessibility.build — Accessible AI chat interfaces](https://accessibility.build/guides/accessible-ai-chat) (LOW–MEDIUM)
- [Springer AI & Society (2026) — hidden functions of sycophancy](https://link.springer.com/article/10.1007/s00146-026-02993-z) (MEDIUM)
- [arXiv 2605.21778 — What counts as AI sycophancy? taxonomy](https://arxiv.org/html/2605.21778v1) (MEDIUM)
- [Scholarly Kitchen (2026-09) — personalization, sycophancy, echo chambers](https://scholarlykitchen.sspnet.org/2026/09/02/when-your-ai-knows-you-too-well-personalization-sycophancy-and-the-risk-of-an-intellectual-echo-chamber-in-ai-assisted-research/) (MEDIUM)
- [Intercom — Wikipedia (Fin 2 uses Claude, performs actions)](https://en.wikipedia.org/wiki/Intercom,_Inc.) (MEDIUM)
- Repo: `ai-tooling/CLAUDE.md` (locked decisions), `.planning/PROJECT.md` (v1.2 goal, core value), `FEATURE_BACKLOG.md` "Jeeves AI Assistant", `backend/internal/core/domain/perspective.go` (Privacy + RestrictToPublicOrOwner), `frontend/src/lib/components/` (SettingsDialog, PerspectiveEditor, SafeHtml, onboarding)

---
*Feature research for: in-app AI assistant (help + perspective refinement)*
*Researched: 2026-09-26*
