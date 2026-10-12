import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContributePanel from '$lib/components/contribute/ContributePanel.svelte';
import type { ContributePath } from '$lib/contribute/config';
import HeartIcon from '@lucide/svelte/icons/heart';
import StarIcon from '@lucide/svelte/icons/star';

const icon = HeartIcon as unknown as ContributePath['icon'];
const SUPPORT_URL = 'https://buy.stripe.com/test_abc';

const supportPath: ContributePath = {
	id: 'support',
	title: 'Support Perspectize',
	description: 'A small one-off tip helps cover hosting.',
	icon,
	links: [{ id: 'stripe', label: 'Leave a tip', href: SUPPORT_URL }],
};

describe('ContributePanel', () => {
	it('renders the support link with target and rel for a new tab', () => {
		render(ContributePanel, { props: { paths: [supportPath] } });
		const link = screen.getByRole('link', { name: /leave a tip/i });
		expect(link).toHaveAttribute('href', SUPPORT_URL);
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('announces that the link opens in a new tab', () => {
		render(ContributePanel, { props: { paths: [supportPath] } });
		const link = screen.getByRole('link', { name: /leave a tip/i });
		expect(link.textContent).toContain('(opens in a new tab)');
		expect(link.getAttribute('aria-label')).toBeNull();
	});

	it('renders each path title as a level 3 heading', () => {
		render(ContributePanel, { props: { paths: [supportPath] } });
		expect(screen.getByRole('heading', { level: 3, name: 'Support Perspectize' })).toBeTruthy();
	});

	it('hides decorative icons from assistive tech', () => {
		const { container } = render(ContributePanel, { props: { paths: [supportPath] } });
		const svgs = container.querySelectorAll('svg');
		expect(svgs.length).toBeGreaterThan(0);
		svgs.forEach((svg) => expect(svg.getAttribute('aria-hidden')).toBe('true'));
	});

	it('keeps links keyboard-reachable and focusable', () => {
		render(ContributePanel, { props: { paths: [supportPath] } });
		const link = screen.getByRole('link', { name: /leave a tip/i });
		expect(link.getAttribute('tabindex')).not.toBe('-1');
		link.focus();
		expect(document.activeElement).toBe(link);
	});

	it('renders every link across a multi-path, multi-link fixture (Phase 2 shape)', () => {
		const paths: ContributePath[] = [
			{
				id: 'support',
				title: 'Path One',
				description: 'one',
				icon,
				links: [{ id: 'a', label: 'Link A', href: 'https://a.example.com' }],
			},
			{
				id: 'develop',
				title: 'Path Two',
				description: 'two',
				icon: StarIcon as unknown as ContributePath['icon'],
				links: [
					{ id: 'b', label: 'Link B', href: 'https://b.example.com' },
					{ id: 'c', label: 'Link C', href: 'https://c.example.com' },
					{ id: 'd', label: 'Link D', href: 'https://d.example.com' },
				],
			},
			{
				id: 'qa',
				title: 'Path Three',
				description: 'three',
				icon,
				links: [
					{ id: 'e', label: 'Link E', href: 'https://e.example.com' },
					{ id: 'f', label: 'Link F', href: 'https://f.example.com' },
				],
			},
		];
		render(ContributePanel, { props: { paths } });
		expect(screen.getAllByRole('link')).toHaveLength(6);
		expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
	});

	describe('link badge', () => {
		const subscribePath: ContributePath = {
			id: 'subscribe',
			title: 'Become a supporter',
			description: 'Guaranteed access to Perspectize through the term.',
			icon,
			links: [
				{ id: 'monthly', label: '$5 / month', href: 'https://m.example.com' },
				{ id: 'annual', label: '$36 / year', href: 'https://a.example.com', badge: 'Save 40%' },
			],
		};

		it('shows the badge beside the link that has one', () => {
			render(ContributePanel, { props: { paths: [subscribePath] } });
			const annual = screen.getByRole('link', { name: /\$36 \/ year/ });
			expect(annual.textContent).toContain('Save 40%');
		});

		it('shows no badge on a link without one', () => {
			render(ContributePanel, { props: { paths: [subscribePath] } });
			const monthly = screen.getByRole('link', { name: /\$5 \/ month/ });
			expect(monthly.textContent).not.toContain('Save');
		});

		it('renders both subscription links and the guaranteed-access description', () => {
			render(ContributePanel, { props: { paths: [subscribePath] } });
			expect(screen.getAllByRole('link')).toHaveLength(2);
			expect(screen.getByText('Guaranteed access to Perspectize through the term.')).toBeTruthy();
		});
	});

	it('renders no list when there are no paths', () => {
		render(ContributePanel, { props: { paths: [] } });
		expect(screen.queryByRole('list')).toBeNull();
	});
});
