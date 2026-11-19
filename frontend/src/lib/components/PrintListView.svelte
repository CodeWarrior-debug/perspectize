<script lang="ts">
	import type { ExportTable } from '$lib/utils/exportTable';

	let { table, title, spacing }: { table: ExportTable; title: string; spacing: 'compact' | 'standard' | 'roomy' } =
		$props();

	// Print rules hide every other child of <body>, so this view must be one itself.
	function portalToBody(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			},
		};
	}
</script>

<div class="print-root" data-spacing={spacing} use:portalToBody>
	{#if title}
		<h1>{title}</h1>
	{/if}
	<table>
		<thead>
			<tr>
				{#each table.headers as header, c (c)}
					<th data-col={table.columnIds[c]}>{header}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each table.rows as row, r (r)}
				<tr>
					{#each row as cell, c (c)}
						<td data-col={table.columnIds[c]}>
							{#if table.columnIds[c] === 'item' && table.rowUrls[r]}
								<a href={table.rowUrls[r]}>{cell}</a>
							{:else}
								{cell}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
