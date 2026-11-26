You are implementing one ticket in a Go + SvelteKit monorepo (Perspectize). Your working copy is the git worktree at /home/user/perspectize/.claude/worktrees/4. The Go backend is its `backend/` folder. Edit files only inside that directory. Read the CLAUDE.md files there as you would on a normal task.

Rules for this run:
- Do not commit, push, create or switch branches, or run git stash, reset or checkout.
- Do not look at git history or other refs: no git log, show, blame, reflog, cat-file, branch -a, or diffing against another commit, and do not read the .git directory. The upstream fix already exists in the object store and looking at it voids the experiment. `git status` and `git diff` of your own uncommitted changes are fine.
- Do not touch a database or set DATABASE_URL (tests that need a database skip without it). Never run migrations. Never try to log in or read .env files.
- Run each shell command as its own Bash call: never join commands with `&&`. Use `go -C /home/user/perspectize/.claude/worktrees/4/backend ...` instead of cd.
- No web search or web fetch.
- Write or update tests as you see fit. Stop when you consider the ticket done.

TICKET:
A movie link pasted into an import list is stored as typed and only normalised when its row is imported. Normalise it when the
list is built instead. Add `func (s *ImportService) NormalizeMovieLink(raw string) (string, error)` to the import service. For a
TMDB movie link such as `https://www.themoviedb.org/movie/603-the-matrix?language=en` it returns the canonical movie URL the
content service stores (`https://www.themoviedb.org/movie/603`). For anything else, including an IMDb link or id, it returns an
error that wraps `domain.ErrInvalidInput`. The content service already has the link parsing and the canonical URL builder: reuse
them, do not write a second parser. Add tests.

FINAL REPORT (plain text, under 200 words):
1) files you changed, one line each;
2) the build/test commands you ran and their results;
3) anything you were unsure about or could not verify;
4) every git command you ran.
