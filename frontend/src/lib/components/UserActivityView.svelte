<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_CONTENT, type ContentResponse } from '$lib/queries/content';
	import {
		LIST_ACTIVITY_PERSPECTIVES,
		type ListActivityPerspectivesResponse,
	} from '$lib/queries/perspectives';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
	import { queryKeys } from '$lib/queries/keys';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { formatDateTime } from '$lib/utils/formatting';
	import { Switch } from '$lib/components/shadcn';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import PlusIcon from '@lucide/svelte/icons/plus';

	// How many recent events to show per user before collapsing behind "show more".
	const EVENTS_PER_USER = 5;
	// How many content/perspective rows to pull to build the feed from. Client-side
	// aggregation only — see backend note below for why no new query was needed.
	const FEED_SAMPLE_SIZE = 200;

	const meCtx = useMe();
	const currentUserId = $derived(meCtx.me ? meCtx.me.id : null);

	// Only meaningful for the signed-in viewer's own perspectives: the backend's
	// default read-authorization already mixes in "my private perspectives" with
	// everyone else's public ones (and never returns anyone else's private rows —
	// that scoping happens server-side and isn't something this toggle touches).
	// Flipping this off asks explicitly for privacy: PUBLIC, which additionally
	// hides the viewer's own privates from the feed.
	let includeOwnPrivate = $state(true);

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60 * 1000,
	}));

	const contentQuery = createQuery(() => ({
		queryKey: queryKeys.content.list({
			sortBy: 'UPDATED_AT',
			sortOrder: 'DESC',
			first: FEED_SAMPLE_SIZE,
		}),
		queryFn: () =>
			graphqlRequest<ContentResponse>(LIST_CONTENT, {
				first: FEED_SAMPLE_SIZE,
				sortBy: 'UPDATED_AT',
				sortOrder: 'DESC',
				includeTotalCount: false,
			}),
		staleTime: 30 * 1000,
	}));

	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.activityFeed(includeOwnPrivate),
		queryFn: () =>
			graphqlRequest<ListActivityPerspectivesResponse>(LIST_ACTIVITY_PERSPECTIVES, {
				first: FEED_SAMPLE_SIZE,
				filter: includeOwnPrivate ? undefined : { privacy: 'PUBLIC' },
			}),
		staleTime: 30 * 1000,
	}));

	const loading = $derived(
		usersQuery.isLoading || contentQuery.isLoading || perspectivesQuery.isLoading,
	);

	type Event =
		| { kind: 'content'; ts: string; contentID: string; name: string }
		| { kind: 'perspective'; ts: string; contentID: string | null; name: string; private: boolean };

	interface UserGroup {
		userID: string;
		username: string;
		events: Event[];
		latestTs: string | null;
	}

	const groups = $derived.by((): UserGroup[] => {
		const users = usersQuery.data?.users ?? [];
		const contentItems = contentQuery.data?.content.items ?? [];
		const perspectiveItems = perspectivesQuery.data?.perspectives.items ?? [];

		const byUser = new Map<string, UserGroup>();
		for (const u of users) {
			byUser.set(u.id, { userID: u.id, username: u.username, events: [], latestTs: null });
		}

		function ensure(userID: string, fallbackName: string): UserGroup {
			let group = byUser.get(userID);
			if (!group) {
				group = { userID, username: fallbackName, events: [], latestTs: null };
				byUser.set(userID, group);
			}
			return group;
		}

		for (const c of contentItems) {
			const group = ensure(c.addedByUserID, `User ${c.addedByUserID}`);
			group.events.push({ kind: 'content', ts: c.updatedAt, contentID: c.id, name: c.name });
		}

		for (const p of perspectiveItems) {
			const group = ensure(p.userID, `User ${p.userID}`);
			group.events.push({
				kind: 'perspective',
				ts: p.updatedAt,
				contentID: p.contentID,
				name: p.content?.name ?? p.description ?? 'a perspective',
				private: p.privacy === 'PRIVATE',
			});
		}

		const result = Array.from(byUser.values());
		for (const group of result) {
			group.events.sort((a, b) => (a.ts < b.ts ? 1 : -1));
			group.latestTs = group.events[0]?.ts ?? null;
		}

		// Users with no activity sort to the bottom, most-recently-active first
		// otherwise. The signed-in user is then pulled to the very top.
		result.sort((a, b) => {
			if (a.latestTs === null && b.latestTs === null) return a.username.localeCompare(b.username);
			if (a.latestTs === null) return 1;
			if (b.latestTs === null) return -1;
			return a.latestTs < b.latestTs ? 1 : -1;
		});

		if (currentUserId !== null) {
			const meIndex = result.findIndex((g) => g.userID === currentUserId);
			if (meIndex > 0) {
				const [me] = result.splice(meIndex, 1);
				result.unshift(me);
			}
		}

		return result;
	});
</script>

<div class="flex flex-col gap-4 px-2 py-2">
	{#if meCtx.me}
		<label class="flex w-fit items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
			<Switch bind:checked={includeOwnPrivate} />
			Include my private perspectives
		</label>
	{/if}

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading activity…</div>
	{:else if groups.length === 0}
		<div class="py-12 text-center text-muted-foreground">No users yet</div>
	{:else}
		{#each groups as group (group.userID)}
			<div class="rounded-lg border border-border bg-card p-3" data-testid={`user-activity-${group.userID}`}>
				<div class="mb-2 flex items-center gap-2">
					<h3 class="text-sm font-semibold text-foreground">
						{group.userID === currentUserId ? 'You' : group.username}
					</h3>
					{#if group.userID === currentUserId}
						<span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">You</span>
					{/if}
				</div>

				{#if group.events.length === 0}
					<p class="text-xs text-muted-foreground">No activity yet</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each group.events.slice(0, EVENTS_PER_USER) as event, i (i)}
							<li class="flex items-start gap-2 text-sm">
								<span class="mt-0.5 flex size-5 flex-none items-center justify-center text-muted-foreground">
									{#if event.kind === 'perspective'}
										<GlassesIcon class="size-3.5" />
									{:else}
										<PlusIcon class="size-3.5" />
									{/if}
								</span>
								<div class="min-w-0 flex-1">
									<div class="line-clamp-1 font-medium text-foreground">
										{event.kind === 'content' ? 'Added' : 'Perspective on'}
										{event.name}
										{#if event.kind === 'perspective' && event.private}
											<span class="ml-1 text-[11px] font-normal text-muted-foreground">(private)</span>
										{/if}
									</div>
									<div class="text-xs text-muted-foreground">{formatDateTime(event.ts)}</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{/if}
</div>
