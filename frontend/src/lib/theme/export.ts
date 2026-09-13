import { toCssVarMap, type FullThemeTokens } from './derive';

export function themeToCssText(themeName: string, tokens: FullThemeTokens): string {
	const vars = toCssVarMap(tokens);
	const lines = Object.entries(vars)
		.map(([k, v]) => `\t${k}: ${v};`)
		.join('\n');
	return `/* ${themeName} — exported from Perspectize */\n@theme {\n${lines}\n}\n`;
}

export function themeFileName(themeName: string): string {
	const slug =
		themeName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'theme';
	return `${slug}.css`;
}

/** Triggers a browser download of the theme as a CSS file. */
export function downloadThemeCss(themeName: string, tokens: FullThemeTokens): void {
	const text = themeToCssText(themeName, tokens);
	const blob = new Blob([text], { type: 'text/css' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = themeFileName(themeName);
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
