# GitHub Projects (v2)

The `gh project` command may not be available. Use GraphQL API directly:

```bash
# List user's projects
gh api graphql -f query='{ viewer { projectsV2(first: 10) { nodes { id title number } } } }'

# Get issue node ID
gh api graphql -f query='query { repository(owner: "OWNER", name: "REPO") { issue(number: 35) { id } } }'

# Add issue to project
gh api graphql -f query='mutation { addProjectV2ItemById(input: { projectId: "PROJECT_ID", contentId: "ISSUE_NODE_ID" }) { item { id } } }'
```

**Token scopes:** If you get "INSUFFICIENT_SCOPES" errors for project operations, refresh auth:
```bash
gh auth refresh -h github.com -s read:project -s project
```
This opens a browser flow to authorize additional scopes.
