You are implementing one ticket in a Go + SvelteKit monorepo (Perspectize). Your working copy is the git worktree at /home/user/perspectize/.claude/worktrees/3. The SvelteKit app is its `frontend/` folder, and its dependencies are already installed. Edit files only inside that directory. Read the CLAUDE.md files there as you would on a normal task.

Rules for this run:
- Do not commit, push, create or switch branches, or run git stash, reset or checkout.
- Do not look at git history or other refs: no git log, show, blame, reflog, cat-file, branch -a, or diffing against another commit, and do not read the .git directory. The upstream fix already exists in the object store and looking at it voids the experiment. `git status` and `git diff` of your own uncommitted changes are fine.
- Never try to sign in, and never read .env files. No browser verification is possible here.
- Run each shell command as its own Bash call: never join commands with `&&`. Use `pnpm --dir /home/user/perspectize/.claude/worktrees/3/frontend ...` instead of cd.
- No web search or web fetch.
- Write or update tests as you see fit. Stop when you consider the ticket done.

TICKET:
In the perspective editor (`PerspectivePopover.svelte`), once the user has picked at least one feeling on the wheel, show a line
under the wheel for the first picked feeling: "N of M perspectives felt <emoji> <label>", where N and M are `count` and
`totalPerspectives` from the backend's `feelingStats(contentID, emoji, label)` query (see `backend/schema.graphql`), scoped to
the content item being edited. The label is omitted when the feeling has none. While the numbers load, or if the request fails,
show nothing. Give the line `data-testid="feeling-stats"`. Add tests.

FINAL REPORT (plain text, under 200 words):
1) files you changed, one line each;
2) the build/test commands you ran and their results;
3) anything you were unsure about or could not verify;
4) every git command you ran.
