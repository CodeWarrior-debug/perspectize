<script lang="ts">
	import AgGridSvelte5Component from 'ag-grid-svelte5';
	import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
	import { themeQuartz } from '@ag-grid-community/theming';
	import type { GridApi, GridOptions, ColDef } from '@ag-grid-community/core';
	import {
		itemCellRenderer,
		typeCellRenderer,
		perspectiveCellRenderer,
		PerspectiveHeaderRenderer,
		durationValueGetter,
		dateValueFormatter,
		formatCount,
		formatPublishDate,
		formatTags,
	} from '$lib/utils/formatting';
	import { capitalizeContentType, durationComparator } from '$lib/utils/grid-config';

	let {
		testRowData = [],
		onGridReady: onGridReadyCb,
		onSortChanged: onSortChangedCb,
		onFilterChanged: onFilterChangedCb,
	}: {
		testRowData?: any[];
		onGridReady?: (api: GridApi) => void;
		onSortChanged?: (event: any) => void;
		onFilterChanged?: (event: any) => void;
	} = $props();

	let gridApi = $state<GridApi | null>(null);

	const modules = [ClientSideRowModelModule];

	const theme = themeQuartz.withParams({
		fontFamily: "'Geist', system-ui, sans-serif",
		fontSize: 14,
		headerBackgroundColor: '#1a365d',
		headerTextColor: '#ffffff',
		rowHeight: 44,
		headerHeight: 40,
	});

	const columnDefs: ColDef[] = [
		{
			colId: 'perspectize',
			headerName: '',
			headerComponent: PerspectiveHeaderRenderer,
			flex: 0,
			width: 50,
			minWidth: 50,
			maxWidth: 50,
			sortable: false,
			filter: false,
			resizable: false,
			cellRenderer: perspectiveCellRenderer,
		},
		{
			colId: 'item',
			headerName: 'Item',
			flex: 2,
			minWidth: 200,
			filter: false,
			cellRenderer: itemCellRenderer,
		},
		{
			colId: 'type',
			headerName: 'Type',
			flex: 0.5,
			maxWidth: 100,
			filter: 'agTextColumnFilter',
			valueGetter: (params: any) => capitalizeContentType(params.data?.contentType),
			cellRenderer: typeCellRenderer,
		},
		{
			colId: 'duration',
			headerName: 'Length',
			flex: 0.7,
			maxWidth: 120,
			filter: 'agNumberColumnFilter',
			valueGetter: durationValueGetter,
			comparator: durationComparator,
		},
		{
			colId: 'views',
			field: 'viewCount',
			headerName: 'Views',
			flex: 0.8,
			maxWidth: 130,
			filter: 'agNumberColumnFilter',
			valueFormatter: (params: any) => formatCount(params.value),
		},
		{
			colId: 'likes',
			field: 'likeCount',
			headerName: 'Likes',
			flex: 0.8,
			maxWidth: 130,
			filter: 'agNumberColumnFilter',
			valueFormatter: (params: any) => formatCount(params.value),
		},
		{
			colId: 'publishDate',
			field: 'publishedAt',
			headerName: 'Date',
			flex: 1,
			maxWidth: 150,
			filter: 'agDateColumnFilter',
			valueFormatter: (params: any) => formatPublishDate(params.value),
		},
		{
			colId: 'channel',
			field: 'channelTitle',
			headerName: 'Channel',
			flex: 1.2,
			maxWidth: 200,
			filter: 'agTextColumnFilter',
		},
		{
			colId: 'tags',
			field: 'tags',
			headerName: 'Tags',
			flex: 1.5,
			maxWidth: 250,
			sortable: false,
			filter: 'agTextColumnFilter',
			valueFormatter: (params: any) => formatTags(params.value),
		},
		{
			colId: 'description',
			field: 'description',
			headerName: 'Description',
			hide: true,
			sortable: false,
		},
		{
			colId: 'updatedAt',
			field: 'updatedAt',
			headerName: 'Updated',
			hide: true,
			valueFormatter: dateValueFormatter,
		},
		{
			colId: 'createdAt',
			field: 'createdAt',
			headerName: 'Date Added',
			hide: true,
			valueFormatter: dateValueFormatter,
		},
	];

	const gridOptions: GridOptions = {
		columnDefs,
		pagination: false,
		defaultColDef: {
			resizable: true,
		},
		getRowId: (params: any) => params.data.id,
		domLayout: 'autoHeight',
		suppressCellFocus: true,
		context: { perspectivesByContentId: new Map() },
		onGridReady: (params) => {
			gridApi = params.api;
			onGridReadyCb?.(params.api);
		},
		onSortChanged: (event) => {
			onSortChangedCb?.(event);
		},
		onFilterChanged: (event) => {
			onFilterChangedCb?.(event);
		},
	};
</script>

<div data-testid="ag-grid-harness" style="width: 1200px; height: 600px;">
	<AgGridSvelte5Component {gridOptions} rowData={testRowData} {theme} {modules} />
</div>
