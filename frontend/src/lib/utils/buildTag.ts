/**
 * Derives the deterministic, app-wide version tag from a commit's committer
 * date and SHA: v<YYYY.MM.DD>-<short7sha>, with the date taken in UTC.
 *
 * The CI tagging workflow (.github/workflows/tag-main.yml), the backend's
 * domain.ComputeTag (backend/internal/core/domain/buildinfo.go), and this
 * function must all produce the identical string for the same commit —
 * proven by testdata/version-tag-fixture.json, shared between this file's
 * test and buildinfo_test.go.
 */
export function computeTag(committerDateISO: string, sha: string): string {
	const date = new Date(committerDateISO);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const shortSha = sha.toLowerCase().slice(0, 7);
	return `v${year}.${month}.${day}-${shortSha}`;
}
