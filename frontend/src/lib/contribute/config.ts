/**
 * Settings → Contribute config. Paths are data: a path whose links all resolve
 * to no valid URL is dropped, so an unset env var never shows an empty tab.
 * Env values are build-time (`VITE_*`), so changing them needs a rebuild.
 */

import type { Component } from 'svelte';
import HeartHandshakeIcon from '@lucide/svelte/icons/heart-handshake';

export interface ContributeLink {
	id: string;
	label: string;
	href: string;
}

export interface ContributePath {
	id: 'support' | 'develop' | 'qa';
	title: string;
	description: string;
	// aria-hidden is in the prop type so the panel can hide the decorative svg.
	icon: Component<{ class?: string; 'aria-hidden'?: 'true' }>;
	links: ContributeLink[];
}

export interface ContributeEnv {
	VITE_SUPPORT_URL?: string;
	VITE_FEATURE_CONTRIBUTE_TAB?: string;
}

/** Returns the trimmed URL only if it parses and uses https:. Anything else is undefined. */
export function safeExternalUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	try {
		const url = new URL(trimmed);
		return url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}

export function buildContributePaths(env: ContributeEnv): ContributePath[] {
	const candidates: ContributePath[] = [
		{
			id: 'support',
			title: 'Support Perspectize',
			description: 'Perspectize is independent. A one-off tip of any amount helps cover hosting costs.',
			icon: HeartHandshakeIcon,
			links: [{ id: 'stripe', label: 'Leave a tip', href: safeExternalUrl(env.VITE_SUPPORT_URL) }].filter(
				(link): link is ContributeLink => link.href !== undefined,
			),
		},
	];
	return candidates.filter((path) => path.links.length > 0);
}

export function isContributeTabEnabled(env: ContributeEnv, paths: ContributePath[]): boolean {
	return env.VITE_FEATURE_CONTRIBUTE_TAB === 'true' && paths.length > 0;
}

// Mapped explicitly: Vite's ImportMetaEnv has no named keys in common with ContributeEnv (a weak type).
const contributeEnv: ContributeEnv = {
	VITE_SUPPORT_URL: import.meta.env.VITE_SUPPORT_URL,
	VITE_FEATURE_CONTRIBUTE_TAB: import.meta.env.VITE_FEATURE_CONTRIBUTE_TAB,
};

export const CONTRIBUTE_PATHS = buildContributePaths(contributeEnv);
export const CONTRIBUTE_TAB_ENABLED = isContributeTabEnabled(contributeEnv, CONTRIBUTE_PATHS);
