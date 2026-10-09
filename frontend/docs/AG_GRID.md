# AG Grid Svelte 5 Setup

The `ag-grid-svelte5` wrapper bundles AG Grid v32.x internally. **Do NOT install `ag-grid-community` separately** — it causes version conflicts.

## Installation

```bash
# Pinned to 32.2.x — latest 32.x is 32.3.9 (check before upgrading)
pnpm add ag-grid-svelte5 @ag-grid-community/core@32.2.1 @ag-grid-community/client-side-row-model@32.2.1 @ag-grid-community/theming@32.2.0
```

## Usage

```svelte
<script lang="ts">
  import AgGridSvelte5Component from 'ag-grid-svelte5';
  import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
  import { themeQuartz } from '@ag-grid-community/theming';
  import type { GridOptions } from '@ag-grid-community/core';

  const modules = [ClientSideRowModelModule];
  const theme = themeQuartz.withParams({ fontFamily: 'Inter, sans-serif' });
  let rowData = $state<MyRow[]>([]);
  const gridOptions: GridOptions<MyRow> = { columnDefs: [...] };
</script>

<AgGridSvelte5Component {gridOptions} {rowData} {theme} {modules} />
```

## Testing

AG Grid requires a real browser for integration testing — jsdom doesn't support the DOM APIs AG Grid relies on.

### Unit Tests (jsdom)

Test pure logic extracted into `$lib/utils/grid-config.ts`:

```bash
pnpm run test:run          # Runs unit tests only (jsdom)
```

Covers: sort field mapping, pagination math, responsive tiers, column visibility, duration comparators, column metadata.

### Browser Tests (Vitest Browser Mode + Playwright)

Test AG Grid integration in a real Chromium browser via `vitest-browser-svelte`:

```bash
pnpm run test:browser      # Runs browser tests (Playwright drives the installed Google Chrome)
pnpm run test:browser:watch  # Watch mode for browser tests
pnpm run test:all          # Runs both unit + browser tests
```

**First-time setup:** none on macOS: `vitest.config.browser.ts` uses the installed Google Chrome. On other machines, either set `PW_CHROMIUM_EXECUTABLE` to a Chrome/Chromium binary or run `npx playwright install chromium`.

Browser tests cover what jsdom cannot:

- Grid lifecycle (`onGridReady`, GridApi availability)
- Cell rendering (thumbnails, SVG icons, links)
- Column sorting (header clicks, sort model)
- Grid API operations (column visibility, `sizeColumnsToFit`, `domLayout`)
- Row ID mapping and data access

Test files: `tests/browser/ag-grid-integration.test.ts`
Fixture: `tests/browser/fixtures/AGGridTestHarness.svelte`

### Architecture

```
vitest.workspace.ts          # Workspace: unit (jsdom) + browser (playwright)
vitest.config.browser.ts     # Browser project config
tests/
├── browser/
│   ├── ag-grid-integration.test.ts  # Browser-mode AG Grid tests
│   ├── fixtures/
│   │   └── AGGridTestHarness.svelte # Minimal AG Grid for testing
│   └── mocks/
│       ├── app-environment.ts       # $app/environment mock
│       ├── app-navigation.ts        # $app/navigation mock
│       └── app-stores.ts            # $app/stores mock
├── components/              # jsdom component tests
└── unit/                    # jsdom pure function tests
```

## Do NOT

- Import from `ag-grid-community` (use `@ag-grid-community/*`)
- Import AG Grid CSS (use `themeQuartz.withParams()`)
- Use `AgGridSvelte` (use `AgGridSvelte5Component`)
