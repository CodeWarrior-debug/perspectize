/**
 * Settings → Contribute config. Paths are data: a path whose links all resolve
 * to no valid URL is dropped, so an unset env var never shows an empty tab.
 * Env values are build-time (`VITE_*`), so changing them needs a rebuild.
 */

import type { Component } from 'svelte';
import HeartHandshakeIcon from '@lucide/svelte/icons/heart-handshake';
import TicketIcon from '@lucide/svelte/icons/ticket';

/** Subscription prices in whole US dollars. Keep in sync with the Stripe prices behind the two Payment Links. */
export const MONTHLY_PRICE = 5;
export const ANNUAL_PRICE = 36;

/** Percent saved by paying annually instead of twelve monthly payments, rounded to a whole number. */
export function annualDiscountPercent(monthly: number = MONTHLY_PRICE, annual: number = ANNUAL_PRICE): number {
	return Math.round((1 - annual / (monthly * 12)) * 100);
}

export interface ContributeLink {
	id: string;
	label: string;
	href: string;
	/** Short note shown beside the label, e.g. "Save 40%". */
	badge?: string;
}

export interface ContributePath {
	id: 'support' | 'subscribe' | 'develop' | 'qa';
	title: string;
	description: string;
	// aria-hidden is in the prop type so the panel can hide the decorative svg.
	icon: Component<{ class?: string; 'aria-hidden'?: 'true' }>;
	links: ContributeLink[];
}

export interface ContributeEnv {
	VITE_SUPPORT_URL?: string;
	VITE_SUPPORT_MONTHLY_URL?: string;
	VITE_SUPPORT_ANNUAL_URL?: string;
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

function subscriptionLinks(env: ContributeEnv): ContributeLink[] {
	const monthly = safeExternalUrl(env.VITE_SUPPORT_MONTHLY_URL);
	const annual = safeExternalUrl(env.VITE_SUPPORT_ANNUAL_URL);
	const links: ContributeLink[] = [];
	if (monthly) links.push({ id: 'monthly', label: `$${MONTHLY_PRICE} / month`, href: monthly });
	if (annual) {
		// The discount is only meaningful next to the monthly option it is measured against.
		const badge = monthly ? `Save ${annualDiscountPercent()}%` : undefined;
		links.push({ id: 'annual', label: `$${ANNUAL_PRICE} / year`, href: annual, badge });
	}
	return links;
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
		{
			id: 'subscribe',
			title: 'Become a supporter',
			description: 'Guaranteed access to Perspectize through the term.',
			icon: TicketIcon,
			links: subscriptionLinks(env),
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
	VITE_SUPPORT_MONTHLY_URL: import.meta.env.VITE_SUPPORT_MONTHLY_URL,
	VITE_SUPPORT_ANNUAL_URL: import.meta.env.VITE_SUPPORT_ANNUAL_URL,
	VITE_FEATURE_CONTRIBUTE_TAB: import.meta.env.VITE_FEATURE_CONTRIBUTE_TAB,
};

export const CONTRIBUTE_PATHS = buildContributePaths(contributeEnv);
export const CONTRIBUTE_TAB_ENABLED = isContributeTabEnabled(contributeEnv, CONTRIBUTE_PATHS);
