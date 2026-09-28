# AI Assistant Integration Research (Jeeves)

**Project:** Perspectize v1.1
**Researched:** February 16, 2026
**Researcher:** Claude Sonnet 4.5
**Confidence:** HIGH

---

## Executive Summary

This research explores integrating an AI assistant ("Jeeves") into Perspectize to help users refine perspectives, discover content, and engage more deeply with the platform. The assistant leverages Anthropic's Claude API with the official Go SDK, providing capabilities like perspective refinement, content discovery, challenge mode, and automated categorization.

**Key Findings:**
- **Official Go SDK Available:** Anthropic provides a well-maintained official Go SDK (v1.22.1+) with streaming, tool use, and prompt caching support
- **Cost-Effective Implementation:** Prompt caching can reduce costs by up to 90% for repeated contexts, making conversational AI economically viable
- **Proven UI Patterns:** Sidebar placement is the dominant 2026 pattern for AI assistants, aligning with user scan patterns and maintaining context
- **Streaming Critical:** Server-Sent Events (SSE) streaming provides responsive UX, with Go's standard library making implementation straightforward
- **Memory Management:** Session-based context management with 5-minute prompt caching enables stateful conversations without custom storage

**Recommended Approach:** Start with a single high-value capability (perspective refinement), implement with sidebar UI pattern, use Claude Sonnet 4.5 for cost/quality balance, and leverage prompt caching aggressively for system prompts and user perspectives.

---

## 1. Claude API Integration (Go)

### Official SDK

**Repository:** [`github.com/anthropics/anthropic-sdk-go`](https://github.com/anthropics/anthropic-sdk-go)

**Installation:**
```bash
go get -u 'github.com/anthropics/anthropic-sdk-go@v1.22.1'
```

**Requirements:** Go 1.22+

**Key Features:**
- ✅ **Streaming** via Server-Sent Events
- ✅ **Tool Use** (function calling with JSON schemas)
- ✅ **Prompt Caching** (5-minute and 1-hour TTL options)
- ✅ **Multi-turn Conversations** with message accumulation
- ✅ **Context-based Cancellation** (Go context integration)
- ✅ **Type Safety** with functional options pattern

### Basic Usage Pattern

```go
package main

import (
    "context"
    "fmt"

    "github.com/anthropics/anthropic-sdk-go"
    "github.com/anthropics/anthropic-sdk-go/option"
)

func main() {
    client := anthropic.NewClient(
        option.WithAPIKey("my-anthropic-api-key"), // defaults to ANTHROPIC_API_KEY
    )

    message, err := client.Messages.New(context.TODO(), anthropic.MessageNewParams{
        MaxTokens: 1024,
        Messages: []anthropic.MessageParam{
            anthropic.NewUserMessage(anthropic.NewTextBlock("What is a quaternion?")),
        },
        Model: anthropic.ModelClaudeSonnet4_5_20250929,
    })

    if err != nil {
        panic(err.Error())
    }
    fmt.Printf("%+v\n", message.Content)
}
```

### Streaming Implementation

```go
stream := client.Messages.NewStreaming(context.TODO(), anthropic.MessageNewParams{
    Model: anthropic.ModelClaudeSonnet4_5_20250929,
    MaxTokens: 1024,
    Messages: []anthropic.MessageParam{
        anthropic.NewUserMessage(anthropic.NewTextBlock(content)),
    },
})

message := anthropic.Message{}
for stream.Next() {
    event := stream.Current()
    err := message.Accumulate(event)
    if err != nil {
        panic(err)
    }

    switch eventVariant := event.AsAny().(type) {
    case anthropic.ContentBlockDeltaEvent:
        switch deltaVariant := eventVariant.Delta.AsAny().(type) {
        case anthropic.TextDelta:
            print(deltaVariant.Text) // Stream to client via SSE
        }
    }
}
```

### Confidence Assessment

| Aspect | Confidence | Source |
|--------|------------|--------|
| SDK Stability | HIGH | Official Anthropic SDK, production-ready |
| Go Integration | HIGH | Idiomatic Go patterns, context support |
| Feature Completeness | HIGH | All required features (streaming, tools, caching) |
| Documentation | HIGH | Official docs + GitHub examples |

**Sources:**
- [Official Anthropic Go SDK](https://github.com/anthropics/anthropic-sdk-go)
- [Client SDKs Documentation](https://platform.claude.com/docs/en/api/client-sdks)

---

## 2. Core Capabilities

Based on the FEATURE_BACKLOG.md description, the following capabilities are prioritized:

### 2.1 Perspective Refinement (MVP Priority)

**Purpose:** Help users articulate their perspectives more clearly, suggest evidence, flag logical gaps.

**How It Works:**
1. User writes initial perspective
2. Jeeves analyzes for clarity, logical structure, evidence gaps
3. Suggests improvements, counter-arguments, or supporting evidence
4. Iterative refinement with conversation history

**Prompt Strategy:**
- System prompt with perspective analysis guidelines (cached)
- User's perspective content (cached via prompt caching)
- Iterative feedback loop with conversation history

**Example Prompt Template:**
```
System: You are Jeeves, a thoughtful perspective refinement assistant. Your role:
- Analyze perspectives for clarity, logical structure, and evidence
- Ask clarifying questions to help users articulate their thinking
- Suggest counter-arguments to strengthen reasoning
- Flag logical gaps or unsupported claims
- Maintain a respectful, collaborative tone

User Perspective: [cached content]
User Request: "Help me refine this perspective on [topic]"

Respond with:
1. Clarity Assessment: Is the perspective clearly stated?
2. Logical Structure: Are arguments well-organized?
3. Evidence Gaps: What claims need support?
4. Suggested Improvements: 2-3 specific refinements
5. Clarifying Questions: Help user think deeper
```

**Research Findings:**
- **Perspective-shifting prompts** ask AI to analyze situations from different viewpoints, helping uncover blind spots ([eweek.com](https://www.eweek.com/news/10-good-vs-bad-chatgpt-prompts-2026/))
- **Iterative refinement** leads to stronger results than trying to write the "perfect" prompt upfront
- **Chain-of-thought prompting** improves quality by forcing the model to articulate its reasoning

### 2.2 Content Discovery

**Purpose:** "Based on your perspectives, you might find this interesting"

**How It Works:**
1. Analyze user's existing perspectives for themes, topics, sentiment
2. Query content database for related videos/content
3. Rank by relevance to user's perspective history
4. Present recommendations with rationale

**Implementation Pattern:**
- Use Claude's tool use capability to query GraphQL API
- Define tools: `search_content(query, filters)`, `get_user_perspectives(user_id)`
- Claude constructs queries based on perspective analysis

**Tool Definition Example:**
```go
tools := []anthropic.ToolParam{
    {
        Name: "search_content",
        Description: "Search for YouTube videos related to specific topics or themes",
        InputSchema: SearchContentSchema, // JSON Schema
    },
    {
        Name: "get_user_perspectives",
        Description: "Retrieve user's perspectives on a topic to understand their interests",
        InputSchema: GetPerspectivesSchema,
    },
}
```

**Research Findings:**
- **Context-aware recommendation systems** expected to grow at 35.62% CAGR 2026-2033 ([SNS Insider](https://www.globenewswire.com/news-release/2026/02/05/3232616/0/en/Content-Recommendation-Engine-Market-to-Surpass-USD-73-81-Billion-by-2033-Fueled-by-AI-Driven-Personalization-and-Omnichannel-Engagement-SNS-Insider.html))
- **Hybrid approaches** combining collaborative filtering and content-based filtering deliver most accurate personalization
- **Conversational interfaces** reshaping how users express intent for discovery

### 2.3 Summarization

**Purpose:** Summarize the range of perspectives on a given piece of content

**How It Works:**
1. Fetch all perspectives for a specific video/content
2. Cluster perspectives by theme/sentiment
3. Generate summary highlighting diversity of viewpoints
4. Present as digestible overview

**Prompt Strategy:**
```
System: Analyze and summarize perspectives on content.
Content: [video title/description]
Perspectives: [all user perspectives as cached content]

Generate:
1. Main Themes: What topics do perspectives address?
2. Sentiment Distribution: Positive/negative/neutral breakdown
3. Notable Arguments: Key points from each perspective cluster
4. Areas of Agreement/Disagreement: Where do users align or diverge?
```

### 2.4 Challenge Mode

**Purpose:** Present counter-arguments to strengthen a user's thinking

**How It Works:**
1. User requests challenge on their perspective
2. Jeeves generates strongest counter-arguments
3. Highlights potential weaknesses or blind spots
4. Encourages user to refine their position

**Prompt Strategy:**
```
System: You are a respectful debate partner. Generate thoughtful counter-arguments.
User Perspective: [cached perspective]
Challenge Level: [gentle/moderate/rigorous]

Generate:
1. Strongest Counter-Arguments: 2-3 opposing viewpoints
2. Evidence Gaps: Claims that need stronger support
3. Alternative Interpretations: Other ways to view the data
4. Questions to Consider: Deepen user's reasoning
```

**Research Findings:**
- **Iterative refinement prompts** build in review-and-improve cycles
- **73% of surveyed users** reported higher creative output after adopting prompt-driven workflows ([accountabilitynow.net](https://accountabilitynow.net/chatgpt-prompts/))

### 2.5 Category/Tag Suggestions

**Purpose:** Auto-suggest categories and tags based on content analysis

**How It Works:**
1. Analyze perspective text for topics, entities, themes
2. Match against existing category/tag taxonomy
3. Suggest new tags if novel themes detected
4. User approves/edits suggestions

**Implementation:**
- Use Claude to extract entities and themes
- Return structured JSON with suggested tags
- Store suggestions in database for user approval

### Capability Prioritization for MVP

| Capability | Priority | Complexity | Value | MVP Include? |
|------------|----------|------------|-------|--------------|
| Perspective Refinement | 1 | Medium | High | ✅ YES |
| Challenge Mode | 2 | Low | High | ✅ YES |
| Category/Tag Suggestions | 3 | Low | Medium | ✅ YES |
| Content Discovery | 4 | High | Medium | ❌ Defer to v1.2 |
| Summarization | 5 | Medium | Medium | ❌ Defer to v1.2 |

**Rationale:**
- **Perspective Refinement** is the core value proposition and aligns with "Jeeves as thoughtful assistant"
- **Challenge Mode** leverages same infrastructure with different prompt
- **Category/Tag Suggestions** provides immediate utility with low complexity
- **Content Discovery** requires GraphQL tool integration and more complex ranking logic
- **Summarization** useful but not differentiating; defer until user base grows

---

## 3. Prompt Engineering

### System Prompt Design

**Principles:**
1. **Define role and tone:** "You are Jeeves, a knowledgeable, thoughtful butler-like assistant"
2. **Specify capabilities:** What Jeeves can and cannot do
3. **Set boundaries:** Respectful, collaborative, never dismissive
4. **Provide examples:** Few-shot prompting for consistent output format

**Example System Prompt (Perspective Refinement):**

```
You are Jeeves, Perspectize's AI assistant. You help users refine their perspectives on content with thoughtful, respectful guidance.

Your capabilities:
- Analyze perspectives for clarity, logical structure, and evidence
- Suggest improvements while respecting the user's viewpoint
- Ask clarifying questions to deepen thinking
- Present counter-arguments constructively to strengthen reasoning
- Suggest relevant categories and tags

Your principles:
- Be respectful and collaborative, never dismissive
- Focus on helping users articulate their thinking, not imposing your views
- Acknowledge uncertainty when appropriate
- Provide specific, actionable feedback
- Maintain a warm, butler-like demeanor (helpful, knowledgeable, never intrusive)

Output format:
When analyzing a perspective, structure your response as:
1. **Clarity**: Is the perspective clearly stated?
2. **Structure**: Are arguments well-organized?
3. **Evidence**: What claims need support?
4. **Suggestions**: 2-3 specific improvements
5. **Questions**: Help the user think deeper
```

### Conversation Flow Patterns

**Pattern 1: Single-Turn Refinement**
```
User: "Refine my perspective on this video"
[User's perspective cached]
→ Jeeves analyzes and responds
→ No follow-up expected
```

**Pattern 2: Multi-Turn Conversation**
```
User: "Refine my perspective"
→ Jeeves: Analysis + clarifying questions
User: Answers questions
→ Jeeves: Updated analysis with new insights
[Entire conversation cached incrementally]
```

**Pattern 3: Challenge Mode**
```
User: "Challenge my perspective"
[User's perspective cached]
→ Jeeves: Counter-arguments + questions
User: "How would I respond to argument X?"
→ Jeeves: Helps formulate response
```

### Prompt Caching Strategy

**What to Cache:**
1. **System Prompt** (rarely changes) - 5-minute cache
2. **User's Perspective Content** (static during conversation) - 5-minute cache
3. **Conversation History** (incremental caching per turn) - 5-minute cache

**Cache Breakpoint Placement:**
```go
anthropic.MessageNewParams{
    Model: anthropic.ModelClaudeSonnet4_5_20250929,
    MaxTokens: 2048,
    System: []anthropic.TextBlockParam{
        {
            Text: systemPrompt,
            CacheControl: &anthropic.CacheControl{Type: "ephemeral"}, // Cache system prompt
        },
    },
    Messages: []anthropic.MessageParam{
        anthropic.NewUserMessage(
            anthropic.NewTextBlock(userPerspective), // Cached implicitly
        ),
        // ... conversation history
        anthropic.NewUserMessage(
            anthropic.NewTextBlockWithCache( // Cache final turn
                userMessage,
                &anthropic.CacheControl{Type: "ephemeral"},
            ),
        ),
    },
}
```

**Cost Savings:**
- First request: Pay 1.25x for cache write
- Subsequent requests: Pay 0.1x for cache read (90% savings on cached content)
- With typical 500-token system prompt + 200-token perspective:
  - First request: ~875 input tokens cost
  - Follow-up: ~70 input tokens cost + new message tokens

**Sources:**
- [Prompt Caching Documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

---

## 4. UI/UX Design

### Recommended Pattern: Sidebar

**Rationale:**
- **Dominant 2026 pattern:** Aligns with left-to-right F-shaped scan pattern ([UX Collective](https://uxdesign.cc/where-should-ai-sit-in-your-ui-1710a258390e))
- **Persistent accessibility:** Capabilities continuously available without disrupting main content
- **Context preservation:** User can reference content while interacting with Jeeves
- **Proven implementations:** ChatGPT Canvas, Lovable, Notion AI use sidebar/side-panel patterns

**Design Specs:**

```
┌──────────────────────────────────────────────────────────┐
│  Header (Perspectize Logo, User Menu)                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────┬─────────────────────────┐│
│  │                            │  Jeeves AI Assistant    ││
│  │  Main Content Area         │  ┌─────────────────────┐││
│  │                            │  │ Chat Interface      │││
│  │  Video Player              │  │                     │││
│  │  Perspective Form          │  │ User: "Refine my..."│││
│  │  Activity Table            │  │ Jeeves: "I notice  │││
│  │                            │  │ your perspective..."│││
│  │                            │  │                     │││
│  │                            │  └─────────────────────┘││
│  │                            │  ┌─────────────────────┐││
│  │                            │  │ Input Box           │││
│  │                            │  │ [Type message...]   │││
│  │                            │  └─────────────────────┘││
│  │                            │  Quick Actions:         ││
│  │                            │  [Refine] [Challenge]   ││
│  └────────────────────────────┴─────────────────────────┘│
│                                                           │
└──────────────────────────────────────────────────────────┘
```

**Sidebar Specifications:**
- **Width:** 400px (fixed), 30% viewport width (responsive)
- **Position:** Right-aligned (main content left-aligned)
- **Collapsible:** Toggle button to hide/show (preserve screen real estate)
- **Sticky:** Scrolls independently of main content
- **Persistent:** Maintains conversation state across page navigation

**Component Breakdown:**

1. **Chat Interface** (Svelte 5 component)
   - Message list with auto-scroll
   - Streaming message updates (SSE integration)
   - Message bubbles: User (right-aligned), Jeeves (left-aligned)
   - Markdown rendering for formatted responses

2. **Input Box**
   - Textarea with auto-resize
   - Send button + Enter key shortcut
   - Character counter (optional)
   - Loading indicator during streaming

3. **Quick Actions**
   - Context-aware buttons based on current page
   - On Perspective Form: [Refine], [Challenge], [Suggest Tags]
   - On Content View: [Summarize Perspectives]
   - Clicking inserts prompt template into input

### Alternative Patterns Considered

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| **Modal** | Focused interaction, no layout changes | Disrupts flow, hides context | ❌ Not suitable |
| **Inline Suggestions** | Contextual, non-intrusive | Limited to specific fields, no conversation | ⚠️ Future enhancement |
| **Bottom Drawer** | Mobile-friendly | Obscures content, awkward on desktop | ❌ Not suitable |

**Future Enhancement: Inline Suggestions**
- On Perspective Form: Show AI icon next to textarea
- Hover/click for quick suggestions without opening sidebar
- "See more in Jeeves" button opens full sidebar conversation

### Accessibility Considerations

- **Keyboard Navigation:** Tab through chat messages, Enter to send
- **Screen Reader Support:** ARIA labels for chat interface, message roles
- **Contrast:** Ensure message bubbles meet WCAG AA standards
- **Resize:** Allow text zoom without breaking layout

**Sources:**
- [AI UI Patterns (2026)](https://uxdesign.cc/where-should-ai-sit-in-your-ui-1710a258390e)
- [assistant-ui Modal Example](https://www.assistant-ui.com/examples/modal)
- [Medium: How to Design AI Assistants That Actually Help](https://medium.muz.li/how-to-design-an-ai-assistant-users-actually-use-81b0fc7dc0ec)

---

## 5. Streaming Implementation

### Server-Sent Events (SSE) Pattern

**Why SSE over WebSockets:**
- **Unidirectional:** Server → Client only (perfect for AI streaming)
- **HTTP-based:** Works with existing infrastructure, no upgrade protocol needed
- **Automatic reconnection:** Built into browser EventSource API
- **Simpler implementation:** No bidirectional state management

**Go Implementation Pattern:**

```go
package handler

import (
    "context"
    "fmt"
    "net/http"

    "github.com/anthropics/anthropic-sdk-go"
)

func (h *Handler) StreamJeevesResponse(w http.ResponseWriter, r *http.Request) {
    // Set SSE headers
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")

    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
        return
    }

    // Parse request body
    var req JeevesRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Create Claude streaming request
    stream := h.claudeClient.Messages.NewStreaming(context.TODO(), anthropic.MessageNewParams{
        Model:     anthropic.ModelClaudeSonnet4_5_20250929,
        MaxTokens: 2048,
        Messages:  req.Messages,
        System:    req.SystemPrompt,
    })

    // Stream to client
    for stream.Next() {
        event := stream.Current()

        switch eventVariant := event.AsAny().(type) {
        case anthropic.ContentBlockDeltaEvent:
            switch deltaVariant := eventVariant.Delta.AsAny().(type) {
            case anthropic.TextDelta:
                // Send SSE event
                fmt.Fprintf(w, "data: %s\n\n", deltaVariant.Text)
                flusher.Flush()
            }
        }
    }

    if err := stream.Err(); err != nil {
        fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
        flusher.Flush()
    }

    fmt.Fprint(w, "event: done\ndata: \n\n")
    flusher.Flush()
}
```

**Frontend (SvelteKit + TanStack Query):**

```typescript
// src/lib/api/jeeves.ts
export function streamJeevesResponse(
  messages: Message[],
  onChunk: (text: string) => void,
  onComplete: () => void,
  onError: (error: string) => void
) {
  const eventSource = new EventSource('/api/jeeves/stream', {
    method: 'POST',
    body: JSON.stringify({ messages }),
    headers: { 'Content-Type': 'application/json' },
  });

  eventSource.onmessage = (event) => {
    onChunk(event.data);
  };

  eventSource.addEventListener('done', () => {
    eventSource.close();
    onComplete();
  });

  eventSource.addEventListener('error', (event) => {
    eventSource.close();
    onError(event.data || 'Streaming error');
  });

  return eventSource;
}
```

**Svelte 5 Component:**

```svelte
<script lang="ts">
  import { streamJeevesResponse } from '$lib/api/jeeves';

  let messages = $state<Message[]>([]);
  let currentResponse = $state('');
  let isStreaming = $state(false);

  function sendMessage(content: string) {
    messages.push({ role: 'user', content });
    currentResponse = '';
    isStreaming = true;

    streamJeevesResponse(
      messages,
      (chunk) => { currentResponse += chunk; },
      () => {
        messages.push({ role: 'assistant', content: currentResponse });
        isStreaming = false;
      },
      (error) => {
        console.error('Streaming error:', error);
        isStreaming = false;
      }
    );
  }
</script>

<div class="chat-container">
  {#each messages as message}
    <MessageBubble {message} />
  {/each}

  {#if isStreaming}
    <MessageBubble message={{ role: 'assistant', content: currentResponse }} streaming />
  {/if}

  <InputBox onSend={sendMessage} disabled={isStreaming} />
</div>
```

### Production Considerations

**Heartbeats:** Send periodic ping events to keep connection alive
```go
ticker := time.NewTicker(15 * time.Second)
defer ticker.Stop()

for {
    select {
    case <-ticker.C:
        fmt.Fprint(w, "event: ping\ndata: \n\n")
        flusher.Flush()
    case <-r.Context().Done():
        return
    }
}
```

**Connection Cleanup:** Handle client disconnects gracefully
```go
// Check for client disconnect
select {
case <-r.Context().Done():
    log.Println("Client disconnected")
    return
default:
    // Continue streaming
}
```

**Timeout Configuration:** Disable default timeouts for SSE routes
```go
// If using chi router
r.Route("/api/jeeves/stream", func(r chi.Router) {
    r.Use(middleware.Timeout(0)) // No timeout for streaming
    r.Post("/", h.StreamJeevesResponse)
})
```

**Sources:**
- [How to Build Real-time Applications with Go and SSE](https://oneuptime.com/blog/post/2026-02-01-go-realtime-applications-sse/view)
- [Streaming Messages - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [go-zero SSE Documentation](https://go-zero.dev/en/docs/tutorials/http/server/sse)

---

## 6. Cost Analysis

### Pricing Breakdown (2026)

| Model | Input Tokens | Output Tokens | Cache Write (5m) | Cache Read |
|-------|--------------|---------------|------------------|------------|
| **Opus 4.6** | $5/MTok | $25/MTok | $6.25/MTok | $0.50/MTok |
| **Opus 4.5** | $5/MTok | $25/MTok | $6.25/MTok | $0.50/MTok |
| **Sonnet 4.5** | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| **Haiku 4.5** | $1/MTok | $5/MTok | $1.25/MTok | $0.10/MTok |

**Recommended Model: Claude Sonnet 4.5**
- **Rationale:** Best balance of quality and cost for conversational AI
- **Quality:** Flagship-level reasoning, suitable for perspective refinement
- **Cost:** 67% lower than Opus, 3x cheaper than previous flagship models

### Cost Scenarios (Per Interaction)

**Scenario 1: First-Time Perspective Refinement (Cold Cache)**
```
System Prompt: 500 tokens (cached)
User Perspective: 200 tokens (cached)
User Message: 50 tokens
Assistant Response: 300 tokens

Input Tokens:
- Cache write (system + perspective): 700 × $3.75/MTok = $0.002625
- Regular input: 50 × $3/MTok = $0.00015
Output Tokens: 300 × $15/MTok = $0.0045

Total Cost: $0.007275 (~0.7 cents)
```

**Scenario 2: Follow-Up Message (Cache Hit)**
```
System Prompt: 500 tokens (cache hit)
User Perspective: 200 tokens (cache hit)
Previous Messages: 350 tokens (cache hit)
User Message: 50 tokens
Assistant Response: 250 tokens

Input Tokens:
- Cache read: 1050 × $0.30/MTok = $0.000315
- Regular input: 50 × $3/MTok = $0.00015
Output Tokens: 250 × $15/MTok = $0.00375

Total Cost: $0.004215 (~0.4 cents) — 42% savings
```

**Scenario 3: Multi-Turn Conversation (5 exchanges)**
```
First exchange: $0.007275 (cold cache)
Exchanges 2-5: $0.004215 × 4 = $0.01686

Total Cost: $0.024135 (~2.4 cents)
Average Per Exchange: $0.004827 (~0.5 cents)
```

### Monthly Cost Projections

**Assumptions:**
- 1,000 active users
- Average 3 Jeeves interactions per user per month
- Average 2.5 exchanges per interaction

**Monthly Calculation:**
```
Users: 1,000
Interactions/user/month: 3
Total interactions: 3,000

Cost per interaction (avg 2.5 exchanges):
= 1 cold cache + 1.5 cache hits
= $0.007275 + (1.5 × $0.004215)
= $0.0136 (~1.4 cents)

Monthly total: 3,000 × $0.0136 = $40.80
```

**Scaling Estimates:**

| Users | Interactions/Month | Cost/Month | Cost/User/Month |
|-------|-------------------|------------|-----------------|
| 100 | 300 | $4.08 | $0.04 |
| 1,000 | 3,000 | $40.80 | $0.04 |
| 10,000 | 30,000 | $408.00 | $0.04 |
| 100,000 | 300,000 | $4,080.00 | $0.04 |

**Cost Optimization Strategies:**

1. **Aggressive Prompt Caching:**
   - Cache system prompts (99% reuse)
   - Cache user perspectives during conversation
   - Use 1-hour cache for power users (2x cost, but better hit rate)

2. **Model Selection by Use Case:**
   - **Perspective Refinement:** Sonnet 4.5 (requires reasoning)
   - **Tag Suggestions:** Haiku 4.5 (structured output, 70% cheaper)
   - **Challenge Mode:** Sonnet 4.5 (creative counter-arguments)

3. **Batch Processing:**
   - Tag suggestions can use Batch API (50% discount)
   - Process multiple perspectives overnight
   - $1.50 input / $7.50 output for Sonnet 4.5

4. **Token Budgets:**
   - Set `max_tokens: 1024` for most responses (avoid runaway costs)
   - Use `max_tokens: 512` for quick suggestions

### Break-Even Analysis

**Assumption:** $10/month subscription for Jeeves Pro tier

**Break-even usage:**
```
$10 / $0.0136 per interaction = 735 interactions/month
= ~25 interactions/day
= Very high power user (unlikely to hit)

Conservative buffer: 200 interactions/month limit
Cost to serve: 200 × $0.0136 = $2.72
Margin: $10 - $2.72 = $7.28 (73% margin)
```

**Free Tier Proposal:**
- 10 interactions/month (cost: $0.14/user)
- Sustainable even with 10,000 free users ($1,400/month)

**Sources:**
- [Claude API Pricing 2026](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude API Pricing Calculator](https://costgoat.com/pricing/claude-api)
- [Anthropic API Pricing Breakdown](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)

---

## 7. Conversation Memory

### Session-Based Context Management

**Strategy:** Use prompt caching as the primary memory mechanism for short-term conversations (5-minute sessions).

**Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│  Client (Browser)                                       │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Svelte Component State                            │ │
│  │ - messages: Message[]                             │ │
│  │ - sessionId: string (UUID)                        │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/SSE
┌─────────────────────────────────────────────────────────┐
│  Backend (Go)                                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Conversation Handler                              │ │
│  │ - Receive messages array from client              │ │
│  │ - Build MessageNewParams with cache_control       │ │
│  │ - Stream Claude response back to client           │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │ (Optional) Conversation Store                     │ │
│  │ - Save completed conversations to DB              │ │
│  │ - Load conversation history on page reload        │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ API Call
┌─────────────────────────────────────────────────────────┐
│  Claude API                                             │
│  - Prompt cache (5-minute TTL, auto-refresh)           │
│  - Tracks full conversation prefix                     │
└─────────────────────────────────────────────────────────┘
```

### Implementation Pattern

**Frontend State Management:**
```typescript
// Svelte 5 component state
let conversationId = $state(crypto.randomUUID());
let messages = $state<Message[]>([
  { role: 'system', content: JEEVES_SYSTEM_PROMPT }
]);

function sendMessage(userMessage: string) {
  messages.push({ role: 'user', content: userMessage });

  // Send full message array to backend
  streamJeevesResponse(messages, ...);
}

function loadConversation(id: string) {
  // Load from backend if persisting conversations
  fetch(`/api/jeeves/conversations/${id}`)
    .then(res => res.json())
    .then(data => { messages = data.messages; });
}
```

**Backend Request Handling:**
```go
type JeevesRequest struct {
    SessionID string                   `json:"session_id"`
    Messages  []anthropic.MessageParam `json:"messages"`
}

func (h *Handler) StreamResponse(w http.ResponseWriter, r *http.Request) {
    var req JeevesRequest
    json.NewDecoder(r.Body).Decode(&req)

    // Build params with incremental caching
    params := anthropic.MessageNewParams{
        Model:     anthropic.ModelClaudeSonnet4_5_20250929,
        MaxTokens: 2048,
        System: []anthropic.TextBlockParam{
            {
                Text:         JEEVES_SYSTEM_PROMPT,
                CacheControl: &anthropic.CacheControl{Type: "ephemeral"},
            },
        },
        Messages: req.Messages,
    }

    // Mark last message for caching (conversation history)
    lastIdx := len(params.Messages) - 1
    params.Messages[lastIdx].CacheControl = &anthropic.CacheControl{Type: "ephemeral"}

    // Stream response...
}
```

### Persistence Strategy (Optional)

**When to Persist:**
- User explicitly saves conversation
- Conversation exceeds 5 turns (becomes valuable history)
- User navigates away (save draft)

**Database Schema:**
```sql
CREATE TABLE jeeves_conversations (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    context_type VARCHAR(50), -- 'perspective_refinement', 'challenge_mode', etc.
    context_id UUID,           -- e.g., perspective_id if refining a perspective
    messages JSONB NOT NULL,   -- Array of messages
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jeeves_user_context ON jeeves_conversations(user_id, context_type, context_id);
```

**Load on Page Reload:**
```go
func (h *Handler) GetConversation(w http.ResponseWriter, r *http.Request) {
    sessionID := chi.URLParam(r, "sessionID")
    userID := GetUserIDFromContext(r.Context())

    var conv Conversation
    err := h.db.QueryRow(
        "SELECT id, messages FROM jeeves_conversations WHERE id = $1 AND user_id = $2",
        sessionID, userID,
    ).Scan(&conv.ID, &conv.Messages)

    json.NewEncoder(w).Encode(conv)
}
```

### Memory Management Best Practices

**Short-term (5-minute sessions):**
- ✅ Use prompt caching exclusively
- ✅ Client maintains message array state
- ✅ No database writes for transient conversations
- **Cost:** Cache write ($3.75/MTok) + cache reads ($0.30/MTok)

**Long-term (persistent conversations):**
- ⚠️ Save to database after 5+ turns or explicit user action
- ⚠️ Load from database on page reload
- ⚠️ Re-establish cache on first message after reload (cache miss)
- **Cost:** Database storage + occasional cache miss

**Research Findings:**
- **Session memory** from OpenAI Agents SDK provides reference implementation ([OpenAI Cookbook](https://cookbook.openai.com/examples/agents_sdk/session_memory))
- **Short-term vs. long-term memory:** 5-minute cache handles short-term, DB handles long-term
- **2026 trend:** Universal memory extensions for cross-platform context ([Plurality Network](https://plurality.network/blogs/best-universal-ai-memory-extensions-2026/))

**Sources:**
- [OpenAI Session Memory Management](https://cookbook.openai.com/examples/agents_sdk/session_memory)
- [AI Agent Memory - Databricks](https://docs.databricks.com/aws/en/generative-ai/agent-framework/stateful-agents)
- [Building AI Memory Systems - Medium](https://medium.com/@sajo02/building-intelligent-ai-memory-systems-combining-conversation-buffers-with-structured-storage-in-065c083b061c)

---

## 8. Safety Considerations

### Content Moderation

**Claude's Built-in Safeguards:**
- Pre-trained safety measures to refuse harmful requests
- Constitutional AI (CAI) training reduces toxic outputs
- Automatic filtering of harmful content in both inputs and outputs

**Limitations:**
- **Bypass techniques exist:** New attack methods constantly developed
- **False positives:** Benign content sometimes flagged
- **Imperfect:** Attackers succeed at a moderately high rate

**Perspectize-Specific Safeguards:**

1. **Input Validation**
   - Sanitize user input before sending to Claude
   - Rate limiting: Max 10 Jeeves requests per minute per user
   - Content length limits: Max 10,000 characters per perspective

2. **Output Filtering**
   - Monitor for generated content containing hate speech, harassment
   - Implement keyword-based filtering as secondary layer
   - Log flagged interactions for review

3. **User Reporting**
   - "Report inappropriate response" button in chat interface
   - Flag conversations for manual review
   - Suspend Jeeves access for abusive users

**Implementation Pattern:**
```go
func (h *Handler) ValidateJeevesRequest(req *JeevesRequest) error {
    // Rate limiting
    if !h.rateLimiter.Allow(req.UserID) {
        return errors.New("rate limit exceeded")
    }

    // Content length
    totalChars := 0
    for _, msg := range req.Messages {
        totalChars += len(msg.Content)
    }
    if totalChars > 10000 {
        return errors.New("content too long")
    }

    // Profanity filter (basic example)
    if containsProfanity(req.Messages) {
        h.logSuspiciousRequest(req)
        // Could block or allow with warning
    }

    return nil
}
```

### User Trust Building

**Transparency Measures:**

1. **Explain AI Limitations**
   - Onboarding tooltip: "Jeeves is an AI assistant. Responses may contain errors."
   - Visible "AI-generated" label on all Jeeves messages
   - Link to "How Jeeves Works" documentation

2. **User Control**
   - Easy opt-out: Disable Jeeves in settings
   - Conversation history: View and delete past conversations
   - Edit AI suggestions before accepting

3. **Feedback Loop**
   - Thumbs up/down on each response
   - "This was helpful/unhelpful" feedback
   - Improves prompt engineering over time

**Privacy Considerations:**

- **Data Handling:** User conversations sent to Anthropic API
  - Anthropic's Data Usage Policy: API data not used for training unless opted in
  - Perspectize should clarify this in privacy policy

- **Data Retention:**
  - Temporary conversations: Not persisted (only in-memory)
  - Saved conversations: Encrypted at rest, user can delete
  - No sharing with third parties beyond Anthropic

**UI Pattern:**
```svelte
<div class="jeeves-message">
  <div class="message-header">
    <JeevesIcon />
    <span class="ai-badge">AI-generated</span>
  </div>
  <div class="message-content">
    {@html markdown(message.content)}
  </div>
  <div class="message-actions">
    <button on:click={thumbsUp}>👍</button>
    <button on:click={thumbsDown}>👎</button>
    <button on:click={reportIssue}>⚠️ Report</button>
  </div>
</div>
```

### Compliance & Risk Mitigation

**Legal Considerations:**
- **Disclaimer:** Jeeves provides suggestions, not professional advice
- **User Responsibility:** Users are responsible for their final perspectives
- **Terms of Service:** Prohibit using Jeeves for harmful purposes

**Risk Monitoring:**
- Log all Jeeves interactions (for debugging, not surveillance)
- Monitor for abuse patterns (e.g., attempts to jailbreak)
- Quarterly review of flagged conversations

**Research Findings:**
- **2026 AI Safety Report:** Over 100 experts assess AI capabilities and risks ([Inside Privacy](https://www.insideprivacy.com/artificial-intelligence/international-ai-safety-report-2026-examines-ai-capabilities-risks-and-safeguards/))
- **Hybrid AI-human systems:** 2026 trend toward real-time, 24/7 coverage with human oversight ([Conectys](https://www.conectys.com/blog/posts/ai-content-moderation-trends-for-2026/))
- **Layered safeguards:** Multiple, layered safeguards are most robust ([Lakera](https://www.lakera.ai/blog/content-moderation))

**Sources:**
- [International AI Safety Report 2026](https://www.insideprivacy.com/artificial-intelligence/international-ai-safety-report-2026-examines-ai-capabilities-risks-and-safeguards/)
- [AI Content Moderation Trends 2026](https://www.conectys.com/blog/posts/ai-content-moderation-trends-for-2026/)
- [Content Moderation for GenAI - Lakera](https://www.lakera.ai/blog/content-moderation)

---

## 9. Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Single capability (Perspective Refinement) with sidebar UI

**Deliverables:**
1. ✅ Claude API Integration
   - Install `anthropic-sdk-go`
   - Create `internal/jeeves` package
   - Basic message handling (no streaming yet)

2. ✅ Backend API
   - `POST /api/jeeves/refine` — Accept perspective, return refinement
   - System prompt for perspective refinement
   - Basic rate limiting (10 req/min per user)

3. ✅ Frontend UI
   - Sidebar component (Svelte 5)
   - Basic chat interface (message list + input)
   - "Refine Perspective" quick action button

4. ✅ Cost Tracking
   - Log token usage per request
   - Monitor monthly spend
   - Alert if approaching budget threshold

**Success Criteria:**
- User can click "Refine" on Perspective Form
- Jeeves analyzes perspective and suggests improvements
- Response appears in sidebar within 3 seconds
- Cost < $0.02 per interaction

**Timeline:** 2 weeks (1 sprint)

### Phase 2: Enhanced UX

**Goal:** Streaming responses + conversation history

**Deliverables:**
1. ✅ SSE Streaming
   - Implement SSE endpoint (`/api/jeeves/stream`)
   - Update frontend to use EventSource
   - Typewriter effect for streaming messages

2. ✅ Prompt Caching
   - Add cache_control to system prompt
   - Cache user perspective during conversation
   - Monitor cache hit rate

3. ✅ Conversation Persistence (Optional)
   - Database schema for conversations
   - Save/load conversation on demand
   - "Continue conversation" from perspective page

4. ✅ UI Polish
   - Markdown rendering in responses
   - Message timestamps
   - Collapsible sidebar

**Success Criteria:**
- Responses stream word-by-word
- Cache hit rate > 80% for follow-up messages
- Time-to-first-token < 500ms

**Timeline:** 2 weeks (1 sprint)

### Phase 3: Additional Capabilities

**Goal:** Challenge Mode + Tag Suggestions

**Deliverables:**
1. ✅ Challenge Mode
   - New prompt template for counter-arguments
   - "Challenge My Perspective" quick action
   - UI toggle between Refine/Challenge modes

2. ✅ Tag Suggestions
   - Tool use implementation (call GraphQL API)
   - Extract entities/themes from perspective
   - Suggest tags with confidence scores

3. ✅ Analytics Dashboard
   - Track Jeeves usage per user
   - Most common use cases
   - User satisfaction (thumbs up/down)

**Success Criteria:**
- Challenge mode generates compelling counter-arguments
- Tag suggestions accuracy > 70% (user acceptance rate)
- 30% of users engage with Jeeves at least once

**Timeline:** 2 weeks (1 sprint)

### Phase 4: Advanced Features (Future)

**Goal:** Content Discovery + Summarization

**Deliverables:**
1. ⚠️ Content Discovery
   - Tool use: Search content database
   - Personalization based on user's perspective history
   - "Recommended for You" section in sidebar

2. ⚠️ Perspective Summarization
   - Fetch all perspectives for a video
   - Cluster by theme/sentiment
   - Generate digestible summary

3. ⚠️ Voice Input (Experimental)
   - Browser SpeechRecognition API
   - "Speak to Jeeves" button
   - Convert speech to text, send to Claude

**Success Criteria:**
- Content recommendations 50%+ click-through rate
- Summarization captures key themes accurately
- Voice input transcription accuracy > 90%

**Timeline:** 4 weeks (2 sprints)

### Phase-Specific Research Flags

| Phase | Research Needed | Rationale |
|-------|-----------------|-----------|
| Phase 1 | ❌ None | Straightforward API integration |
| Phase 2 | ⚠️ SSE reconnection strategies | Handle dropped connections gracefully |
| Phase 3 | ⚠️ GraphQL tool schemas | Define precise JSON schemas for tools |
| Phase 4 | ✅ Recommendation algorithms | Content discovery requires ranking logic |
| Phase 4 | ✅ Speech-to-text integration | Voice input needs research on best libraries |

---

## 10. Open Questions & Future Research

### Technical Uncertainties

1. **Tool Use with GraphQL**
   - **Question:** How to define GraphQL queries as Claude tools?
   - **Impact:** Content Discovery capability (Phase 4)
   - **Research needed:** GraphQL schema → JSON Schema conversion

2. **Cache Hit Rate in Production**
   - **Question:** What's the real-world cache hit rate with user variance?
   - **Impact:** Cost projections may be optimistic
   - **Mitigation:** Monitor cache metrics closely in Phase 2

3. **SSE Connection Stability**
   - **Question:** How to handle reconnection after network interruption?
   - **Impact:** User experience during streaming
   - **Research needed:** Retry strategies, idempotency tokens

### Product Uncertainties

1. **User Adoption**
   - **Question:** Will users actually engage with Jeeves?
   - **Risk:** Low usage makes feature not worth maintenance cost
   - **Validation:** A/B test "Refine Perspective" button in Phase 1

2. **Moderation Overhead**
   - **Question:** How much manual review will flagged conversations require?
   - **Risk:** Moderation burden slows down development
   - **Mitigation:** Start with automated filters, scale moderation as needed

3. **Pricing Model**
   - **Question:** Should Jeeves be free, freemium, or Pro-only?
   - **Options:**
     - **Free tier:** 10 interactions/month (sustainable at scale)
     - **Freemium:** Unlimited basic, premium features (voice, discovery) paid
     - **Pro-only:** $10/month, unlimited Jeeves access
   - **Validation:** Survey users on willingness to pay

### Areas for Deeper Investigation

1. **Perspective Quality Metrics**
   - How to measure if Jeeves actually improves perspective quality?
   - Metrics: Word count increase, evidence citations added, logical structure score?
   - Research: NLP-based quality scoring algorithms

2. **Personalization**
   - Should Jeeves adapt to individual user's writing style?
   - Fine-tuning vs. prompt engineering for personalization?
   - Research: User preference modeling, adaptive prompts

3. **Multi-Modal Input**
   - Could Jeeves analyze video content directly (not just perspectives)?
   - Vision API for thumbnail analysis, video frame extraction?
   - Research: Claude Vision capabilities for video content

---

## Conclusion

Integrating an AI assistant (Jeeves) into Perspectize is **technically feasible and economically viable** with current technology. The official Anthropic Go SDK provides production-ready tooling, prompt caching enables cost-effective conversational AI, and established UI patterns (sidebar) offer proven user experiences.

**Recommended Next Steps:**
1. **Prototype Phase 1 (Foundation)** with Perspective Refinement
2. **Validate user engagement** via analytics and qualitative feedback
3. **Iterate on prompts** based on real user conversations
4. **Scale gradually** to additional capabilities (Challenge Mode, Tag Suggestions)
5. **Monitor costs** and adjust caching strategy as needed

**Key Success Factors:**
- ✅ Start small: One capability, nail the UX
- ✅ Measure ruthlessly: Track usage, costs, satisfaction
- ✅ Iterate fast: Prompt engineering is 90% of the work
- ✅ Trust users: Provide transparency, control, and feedback mechanisms

**High Confidence Recommendation:** Proceed with Phase 1 implementation. The research supports technical feasibility, cost projections are conservative, and the value proposition (perspective refinement) aligns with Perspectize's core mission.

---

## Sources

### Official Documentation
- [Anthropic Go SDK](https://github.com/anthropics/anthropic-sdk-go)
- [Client SDKs Documentation](https://platform.claude.com/docs/en/api/client-sdks)
- [Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Go Implementation Guides
- [How to Build Real-time Applications with Go and SSE](https://oneuptime.com/blog/post/2026-02-01-go-realtime-applications-sse/view)
- [Server-Sent Events with Go](https://medium.com/@rian.eka.cahya/server-sent-event-sse-with-go-10592d9c2aa1)
- [go-zero SSE Documentation](https://go-zero.dev/en/docs/tutorials/http/server/sse)

### AI UX Patterns
- [Where Should AI Sit in Your UI?](https://uxdesign.cc/where-should-ai-sit-in-your-ui-1710a258390e)
- [How to Design AI Assistants That Actually Help](https://medium.muz.li/how-to-design-an-ai-assistant-users-actually-use-81b0fc7dc0ec)
- [assistant-ui Modal Example](https://www.assistant-ui.com/examples/modal)

### Prompt Engineering
- [10 ChatGPT Prompt Engineering Tips (2026)](https://www.eweek.com/news/10-good-vs-bad-chatgpt-prompts-2026/)
- [AI Prompts for Creative Ideas](https://accountabilitynow.net/chatgpt-prompts/)
- [PromptHelper Research](https://arxiv.org/html/2601.15575)

### Content Discovery & Personalization
- [AI-Powered Recommendation Engines](https://www.shaped.ai/blog/ai-powered-recommendation-engines)
- [Meta's Algorithm Personalization Feature](https://www.cnbc.com/2026/02/11/meta-threads-dear-algo-ai-algorithm-personalization.html)
- [AI Content Recommendation Systems](https://cited.so/blog/ai-content-recommendation)

### Memory & Context Management
- [OpenAI Session Memory](https://cookbook.openai.com/examples/agents_sdk/session_memory)
- [AI Agent Memory - Databricks](https://docs.databricks.com/aws/en/generative-ai/agent-framework/stateful-agents)
- [Building AI Memory Systems - Medium](https://medium.com/@sajo02/building-intelligent-ai-memory-systems-combining-conversation-buffers-with-structured-storage-in-065c083b061c)

### Safety & Moderation
- [International AI Safety Report 2026](https://www.insideprivacy.com/artificial-intelligence/international-ai-safety-report-2026-examines-ai-capabilities-risks-and-safeguards/)
- [AI Content Moderation Trends 2026](https://www.conectys.com/blog/posts/ai-content-moderation-trends-for-2026/)
- [Content Moderation for GenAI - Lakera](https://www.lakera.ai/blog/content-moderation)

### Pricing & Cost Analysis
- [Claude API Pricing Calculator](https://costgoat.com/pricing/claude-api)
- [Anthropic API Pricing Breakdown](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude Pricing Guide 2026](https://www.aifreeapi.com/en/posts/claude-api-pricing-per-million-tokens)
