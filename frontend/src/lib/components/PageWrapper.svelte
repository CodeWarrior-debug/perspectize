<script lang="ts">
	// Optional props for customization
	let { class: className = '', children } = $props();
</script>

<!-- pb-24: the fixed Messages button (bottom-5, size-14) must never sit on top of the last content. -->
<main class="px-4 pt-6 pb-24 md:px-6 md:pt-8 lg:px-8 max-w-screen-xl mx-auto {className}">
	{@render children()}
</main>
