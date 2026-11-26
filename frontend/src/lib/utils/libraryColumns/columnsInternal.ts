/**
 * Timestamp, identifier and source columns. Date Added is a Webpage default; the rest are
 * picker-only (the admin three are offered to admins alone). `unmanaged` columns are never forced
 * on or off by a view's default layout.
 */
import { dateValueFormatter } from '#lib/utils/formatting.js';
import { dateRangeFields } from './filterCodec';
import type { LibraryColumn } from './definition';

export const createdAtColumn: LibraryColumn = {
	colId: 'createdAt',
	label: 'Date Added',
	picker: 'data',
	sort: { server: 'CREATED_AT', client: (row) => row.createdAt },
	filter: {
		key: 'added',
		kind: 'date',
		client: (row) => row.createdAt,
		server: dateRangeFields('createdAfter', 'createdBefore'),
	},
	views: { webpage: 'md' },
	grid: {
		field: 'createdAt',
		flex: 1,
		maxWidth: 150,
		filter: 'agDateColumnFilter',
		filterValueGetter: (params) => {
			const val = params.data?.createdAt;
			return val ? new Date(val) : null;
		},
		valueFormatter: dateValueFormatter,
		headerTooltip: 'Date added to Perspectize',
	},
};

export const updatedAtColumn: LibraryColumn = {
	colId: 'updatedAt',
	label: 'Updated',
	picker: 'data',
	sort: { server: 'UPDATED_AT', client: (row) => row.updatedAt },
	filter: {
		key: 'updated',
		kind: 'date',
		client: (row) => row.updatedAt,
		server: dateRangeFields('updatedAfter', 'updatedBefore'),
	},
	unmanaged: true,
	grid: {
		field: 'updatedAt',
		flex: 1,
		maxWidth: 150,
		filter: 'agDateColumnFilter',
		filterValueGetter: (params) => {
			const val = params.data?.updatedAt;
			return val ? new Date(val) : null;
		},
		valueFormatter: dateValueFormatter,
		headerTooltip: 'Last updated in Perspectize',
	},
};

// Internal columns, offered only to admins (see INTERNAL_COLUMNS in index.ts).
export const contentIdColumn: LibraryColumn = {
	colId: 'id',
	label: 'Content ID',
	picker: 'admin',
	sort: false,
	unmanaged: true,
	grid: {
		field: 'id',
		flex: 1,
		minWidth: 260,
		sortable: false,
		filter: false,
		headerTooltip: 'Internal content record ID',
	},
};

export const addedByUserIdColumn: LibraryColumn = {
	colId: 'addedByUserID',
	label: 'Submitter',
	picker: 'admin',
	sort: false,
	unmanaged: true,
	grid: {
		field: 'addedByUserID',
		flex: 0.7,
		minWidth: 120,
		sortable: false,
		filter: false,
		headerTooltip: 'ID of the user who added this item',
	},
};

export const sourceUrlColumn: LibraryColumn = {
	colId: 'url',
	label: 'Source URL',
	picker: 'admin',
	sort: false,
	unmanaged: true,
	grid: {
		field: 'url',
		flex: 2,
		minWidth: 240,
		sortable: false,
		filter: false,
		headerTooltip: 'Canonical source URL',
	},
};
