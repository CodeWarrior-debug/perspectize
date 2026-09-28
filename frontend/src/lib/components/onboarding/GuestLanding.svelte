<script lang="ts">
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import OnboardingVideo from '$lib/components/onboarding/OnboardingVideo.svelte';
	import { ONBOARDING_VIDEOS } from '$lib/onboarding/config';
</script>

<section
	class="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-12 text-center"
	aria-labelledby="guest-landing-heading"
>
	<div class="space-y-3">
		<h1 id="guest-landing-heading" class="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
			Perspectize
		</h1>
		<p class="text-base text-muted-foreground sm:text-lg text-balance">
			Collect perspectives on the media you care about — see what others notice, not just what they rate.
		</p>
	</div>

	{#if ONBOARDING_VIDEOS.guestProduct}
		<div class="w-full max-w-xl">
			<OnboardingVideo src={ONBOARDING_VIDEOS.guestProduct} label="Watch how it works" />
		</div>
	{/if}

	<div class="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
		<SignInTrigger>
			<button
				type="button"
				class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				Sign in
			</button>
		</SignInTrigger>
	</div>
</section>
