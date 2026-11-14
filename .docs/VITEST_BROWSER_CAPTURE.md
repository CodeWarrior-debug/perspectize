# Vitest Browser Mode: screenshot and video capture

Moved from `frontend/CLAUDE.md`. Read before capturing screenshots or videos from `frontend/tests/browser/` (config: `frontend/vitest.config.browser.ts`).

- `page.screenshot({ path })` resolves the path **relative to the test file**, not against `browser.instances[].screenshotDirectory`; only an absolute path escapes `tests/browser/`.
- `screenshotDirectory` and `attachmentsDir` (failure screenshots, `context.annotate`) are separate options. Set both, or `attachmentsDir` defaults to a stray `frontend/.vitest-attachments/`.
- Writing outside the project root (e.g. a shared screenshots folder) needs `server.fs.allow` widened; Vite's default `server.fs.strict` refuses it.
- The default browser viewport is 414x896, which clips a wide harness (e.g. the 1200px AG Grid fixture). Set `browser.instances[].viewport` explicitly for anything wider.
- Playwright's `recordVideo` records per browser **context**, not per test. Use a `-t` filter to scope a recording to one case, or every test in the run shares one video.
