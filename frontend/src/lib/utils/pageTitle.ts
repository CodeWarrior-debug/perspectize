const PAGE_TITLES: Record<string, string> = {
	'/content-library': 'Library',
	'/discover': 'Discover',
	'/compare': 'Compare',
	'/plan': 'Plan',
	'/declare': 'Declare',
	'/import': 'Import',
	'/messages': 'Messages',
};

/**
 * Document title for a pathname: the tab, history entries and screen-reader page-change
 * announcements all read it. A nested route (`/messages/5`) takes its section's title.
 */
export function pageTitleFor(pathname: string): string {
	const section = Object.keys(PAGE_TITLES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
	return section ? `${PAGE_TITLES[section]} · Perspectize` : 'Perspectize';
}
