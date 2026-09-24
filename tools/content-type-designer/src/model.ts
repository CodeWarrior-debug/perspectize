import {
  COLUMNS,
  SAMPLES,
  TYPES,
  type Binding,
  type ColumnDef,
  type ContentTypeProfile,
  type SampleCell,
  type TypeId
} from './catalog.js';

export type VisibilityRule = 'any' | 'majority' | 'all';

/** The type currently being designed. Shares the profile shape but its id is free-form. */
export interface DraftType extends Omit<ContentTypeProfile, 'id'> {
  id: string;
}

export interface DraftState {
  draft: DraftType;
  /** columnId -> binding for the drafted type, or null when the column is n/a. */
  decisions: Record<string, Binding | null>;
  /** Types compared against the draft in the grid preview. */
  selected: string[];
  rule: VisibilityRule;
  /** Codebase conventions to deliberately deviate from, free text. */
  deviations: string;
  testingNotes: string;
  /** Seeded type the draft was loaded from, so the preview can borrow its sample rows. */
  seed?: string;
  /** Preview sort, highest priority first. Empty/undefined = unsorted. */
  sort?: SortKey[];
}

export interface SortKey {
  colId: string;
  dir: 'asc' | 'desc';
}

export const ALL_TYPE_IDS: string[] = TYPES.map((t) => t.id);

export function typeLabel(id: string, draft: DraftType): string {
  if (id === draft.id) return draft.label || 'New type';
  return TYPES.find((t) => t.id === id)?.label ?? id;
}

export function profileFor(id: string, draft: DraftType): DraftType | ContentTypeProfile | undefined {
  return id === draft.id ? draft : TYPES.find((t) => t.id === id);
}

export function bindingFor(col: ColumnDef, typeId: string, state: DraftState): Binding | undefined {
  if (typeId === state.draft.id) return state.decisions[col.id] ?? undefined;
  return col.bindings[typeId as TypeId];
}

export interface ResolvedColumn {
  col: ColumnDef;
  visible: boolean;
  /** Header actually rendered for the current selection. */
  header: string;
  tooltip: string;
  /** Types in the selection that have a binding. */
  bound: string[];
  /** Types in the selection with no binding — these render the gap fallback. */
  unbound: string[];
  coverage: number;
  defaultOnCount: number;
  /** Distinct per-type labels, used to explain a generic header. */
  aliases: { typeId: string; label: string; unit?: string }[];
  reason: string;
}

export interface Warning {
  severity: 'error' | 'warn' | 'info';
  columnId?: string;
  message: string;
}

export interface GridPreview {
  columns: ResolvedColumn[];
  visible: ResolvedColumn[];
  warnings: Warning[];
}

function ruleSatisfied(rule: VisibilityRule, onCount: number, total: number): boolean {
  if (total === 0) return false;
  if (rule === 'any') return onCount >= 1;
  if (rule === 'all') return onCount === total;
  return onCount * 2 > total;
}

export function resolveGrid(state: DraftState): GridPreview {
  const selection = state.selected.filter((id, i, a) => a.indexOf(id) === i);
  const columns: ResolvedColumn[] = COLUMNS.map((col) => {
    const bound: string[] = [];
    const unbound: string[] = [];
    const aliases: ResolvedColumn['aliases'] = [];
    let defaultOnCount = 0;

    for (const typeId of selection) {
      const binding = bindingFor(col, typeId, state);
      if (!binding) {
        unbound.push(typeId);
        continue;
      }
      bound.push(typeId);
      if (binding.defaultVisible) defaultOnCount += 1;
      aliases.push({ typeId, label: binding.label, unit: binding.unit });
    }

    const total = selection.length;
    const coverage = total === 0 ? 0 : bound.length / total;
    const single = total === 1 && bound.length === 1;
    const soleBinding = single ? bindingFor(col, bound[0], state) : undefined;

    let visible = col.pinned === true || ruleSatisfied(state.rule, defaultOnCount, total);
    let reason = col.pinned
      ? 'Pinned — always shown.'
      : `${defaultOnCount} of ${total} selected type(s) default this column on (rule: ${state.rule}).`;

    // A column nobody in the selection can populate is never worth a header.
    if (bound.length === 0) {
      visible = false;
      reason = 'No selected type binds this column.';
    } else if (visible && col.gapFallback === 'hide-column' && coverage < 0.5) {
      visible = false;
      reason = `Hidden: only ${bound.length}/${total} types bind it and its gap policy is hide-column.`;
    }

    return {
      col,
      visible,
      header: single ? soleBinding?.label ?? col.generic : col.generic,
      tooltip: (single ? soleBinding?.tooltip : undefined) ?? col.tooltip,
      bound,
      unbound,
      coverage,
      defaultOnCount,
      aliases,
      reason
    };
  });

  return { columns, visible: columns.filter((c) => c.visible), warnings: analyse(state, columns) };
}

function analyse(state: DraftState, columns: ResolvedColumn[]): Warning[] {
  const warnings: Warning[] = [];
  const selection = state.selected;
  if (selection.length === 0) {
    return [{ severity: 'warn', message: 'Select at least one content type to preview the grid.' }];
  }

  for (const rc of columns.filter((c) => c.visible && !c.col.pinned)) {
    if (rc.coverage < 0.5) {
      warnings.push({
        severity: 'warn',
        columnId: rc.col.id,
        message: `"${rc.header}" is populated for only ${rc.bound.length}/${selection.length} selected types — ${rc.unbound
          .map((t) => typeLabel(t, state.draft))
          .join(', ')} render the "${rc.col.gapFallback}" fallback. Consider a per-type substitute or dropping it from the default set.`
      });
    }

    const units = new Set(rc.aliases.map((a) => a.unit).filter(Boolean) as string[]);
    if (units.size > 1) {
      warnings.push({
        severity: 'info',
        columnId: rc.col.id,
        message: `"${rc.header}" mixes units across types (${[...units].join(' | ')}). Format per row from length_units. Sorting it alone raises the mixed-unit alert: filter to one type, or sort by Type first and "${rc.header}" second.`
      });
    }

    const sources = new Set(
      rc.bound.map((t) => bindingFor(rc.col, t, state)?.source).filter(Boolean) as string[]
    );
    if (sources.size > 1 && sources.has('user')) {
      warnings.push({
        severity: 'info',
        columnId: rc.col.id,
        message: `"${rc.header}" is user-entered for some types and fetched for others (${[...sources].join(
          ', '
        )}). Say so in the tooltip so the column is not read as one authority.`
      });
    }

    const labels = new Set(rc.aliases.map((a) => a.label));
    if (selection.length > 1 && labels.size > 1) {
      warnings.push({
        severity: 'info',
        columnId: rc.col.id,
        message: `"${rc.col.generic}" stands in for ${[...labels].join(' / ')} — keep the per-type label in the cell tooltip.`
      });
    }
  }

  // Any type losing a field it declares required is a real design hole.
  for (const typeId of selection) {
    for (const rc of columns) {
      const binding = bindingFor(rc.col, typeId, state);
      // Only a field the type wants *on screen* can be "lost" by the rule; a
      // required-but-off-by-default field (ids, timestamps) is not a gap.
      if (binding?.applicability === 'required' && binding.defaultVisible && !rc.visible) {
        warnings.push({
          severity: 'error',
          columnId: rc.col.id,
          message: `${typeLabel(typeId, state.draft)} marks "${binding.label}" required, but the column is hidden for this selection. Either relax it to typical or pin the column when that type is in the filter.`
        });
      }
    }
  }

  const visibleCount = columns.filter((c) => c.visible).length;
  if (visibleCount > 10) {
    warnings.push({
      severity: 'warn',
      message: `${visibleCount} default columns is more than a laptop viewport holds. Trim to ~8 and leave the rest to the column picker.`
    });
  }

  const headerCounts = new Map<string, number>();
  for (const rc of columns.filter((c) => c.visible && c.header)) {
    headerCounts.set(rc.header, (headerCounts.get(rc.header) ?? 0) + 1);
  }
  for (const [header, count] of headerCounts) {
    if (count > 1) {
      warnings.push({ severity: 'error', message: `Two visible columns both render the header "${header}".` });
    }
  }

  return warnings;
}

/** Columns the drafted type shares with at least one seeded type — promotion candidates. */
export function sharedWithOthers(state: DraftState): { col: ColumnDef; others: string[] }[] {
  return COLUMNS.filter((col) => state.decisions[col.id])
    .map((col) => ({
      col,
      others: TYPES.filter((t) => col.bindings[t.id]).map((t) => t.id)
    }))
    .filter((entry) => entry.others.length > 0);
}

/** Sample rows for a type; the draft borrows the rows of the type it was seeded from. */
export function samplesFor(id: string, state: DraftState): Record<string, SampleCell>[] {
  const source = id === state.draft.id ? state.seed : id;
  return (source && SAMPLES[source as TypeId]) || [];
}

/** Text a preview cell shows for a column the row's type does not bind. */
export function gapText(col: ColumnDef): string {
  return col.gapFallback === 'blank' ? '' : '—';
}

/** Distinct units a column carries across the current selection; >1 means sorting it alone is meaningless. */
export function unitsFor(rc: ResolvedColumn): string[] {
  return [...new Set(rc.aliases.map((a) => a.unit).filter(Boolean) as string[])];
}

/**
 * A sort is conflicted when its first key is a column whose units differ across
 * the selection — the rows would be ordered by numbers that mean different things.
 * Putting a unit-consistent column (Type) first resolves it: each type's rows
 * are then ordered within their own unit.
 */
export function sortConflict(keys: SortKey[] | undefined, grid: GridPreview): ResolvedColumn | null {
  const first = keys?.[0];
  if (!first) return null;
  const rc = grid.columns.find((c) => c.col.id === first.colId);
  return rc && unitsFor(rc).length > 1 ? rc : null;
}

/** Parse a preview cell into something orderable: h:mm:ss → seconds, "1,204" / "4.1%" → number. */
export function sortValue(text: string | undefined): number | string | null {
  if (text === undefined || text === '' || text === '—') return null;
  if (/^\d+(:\d{2}){1,2}$/.test(text)) return text.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  const num = text.replace(/[,%]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(num)) return Number(num);
  return text.toLowerCase();
}
