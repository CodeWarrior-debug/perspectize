/**
 * Column-width arithmetic, mirrored from the app so the width budget shown here is the one the
 * real grid would enforce:
 *
 * - Glyph advances: frontend/src/lib/utils/grid-header-metrics.ts (Geist 600, em per glyph).
 * - headerMinWidth: frontend/src/lib/utils/grid-header-width.ts.
 * - Header chrome: grid-theme.ts headerChrome() over themeBalham (spacing 4, iconSize 16,
 *   cellHorizontalPaddingScale 1) with the Activity header params (11px, uppercase, 0.06em).
 *
 * The aggregator chip is new: its reserve is the widest chip label the column can show, so
 * switching aggregator never resizes the column.
 */
/** Advance widths (em) for char codes 32-126, indexed by code - 32. Copied from grid-header-metrics.ts. */
const ADV = [
    0.236, 0.243, 0.376, 0.552, 0.656, 0.818, 0.677, 0.195, 0.306, 0.306, 0.424, 0.566, 0.225, 0.418, 0.225, 0.508,
    0.683, 0.427, 0.642, 0.637, 0.643, 0.656, 0.615, 0.538, 0.644, 0.618, 0.306, 0.306, 0.548, 0.548, 0.548, 0.581,
    0.944, 0.709, 0.695, 0.724, 0.708, 0.615, 0.6, 0.726, 0.719, 0.29, 0.617, 0.672, 0.586, 0.902, 0.748, 0.763,
    0.664, 0.757, 0.689, 0.668, 0.584, 0.699, 0.709, 0.991, 0.66, 0.613, 0.577, 0.375, 0.485, 0.375, 0.45, 0.56,
    0.268, 0.58, 0.621, 0.58, 0.621, 0.591, 0.429, 0.62, 0.601, 0.269, 0.308, 0.628, 0.297, 0.892, 0.601, 0.603,
    0.621, 0.621, 0.409, 0.553, 0.427, 0.597, 0.584, 0.839, 0.628, 0.57, 0.567, 0.401, 0.284, 0.401, 0.523,
];
const WIDEST_EM = 0.991;
/** The Activity header: 11px Geist 600, uppercase, 0.06em letter-spacing. */
export const HEADER_TEXT = { fontSize: 11, uppercase: true, letterSpacingEm: 0.06 };
/** The aggregator chip: 10px Geist 600, lower case, no extra spacing. */
export const CHIP_TEXT = { fontSize: 10 };
const SPACING = 4;
const ICON = 16;
const WIDEST_DIGIT_EM = Math.max(...[...'0123456789'].map((d) => ADV[d.charCodeAt(0) - 32]));
/** Header chrome in px, as headerChrome() computes it for the Activity grid. */
export const CHROME = {
    padding: SPACING * 2,
    sort: SPACING + ICON,
    sortOrder: SPACING + WIDEST_DIGIT_EM * HEADER_TEXT.fontSize,
    filter: SPACING + ICON,
    guard: 2,
};
/** Chip box around its label: horizontal padding, caret and the gap that separates it from the label. */
export const CHIP_BOX = { padX: 5, caret: 8, gapBefore: 4 };
export function textWidth(text, style) {
    const shown = style.uppercase ? text.toUpperCase() : text;
    let em = 0;
    for (const ch of shown)
        em += (ADV[(ch.codePointAt(0) ?? 0) - 32] ?? WIDEST_EM) + (style.letterSpacingEm ?? 0);
    return em * style.fontSize;
}
/** The app's headerMinWidth: label + padding + guard, plus sort arrow, sort order and funnel. */
export function headerMinWidth(label, opts = {}) {
    const { sortable = true, filter = true } = opts;
    let w = CHROME.padding * 2 + textWidth(label, HEADER_TEXT) + CHROME.guard;
    if (sortable)
        w += CHROME.sort + CHROME.sortOrder;
    if (filter)
        w += CHROME.filter;
    return Math.ceil(w);
}
/** Width of one chip (label + padding + caret), without the gap before it. */
export function chipWidth(chipLabel) {
    return Math.ceil(textWidth(chipLabel, CHIP_TEXT) + CHIP_BOX.padX * 2 + CHIP_BOX.caret);
}
/** Smallest cell body a metric column needs: value, spread bar and "n 12" side by side. */
export const METRIC_CELL_MIN = 104;
/**
 * Minimum width of a metric column. `inline` puts the chip beside the label (one 36px header
 * row, reserve added to the width); `stacked` puts it on a second header line (52px header, no
 * extra width unless the chip is wider than the label).
 */
export function metricColumnMin(label, chipLabels, layout) {
    const labelW = textWidth(label, HEADER_TEXT);
    const chrome = CHROME.padding * 2 + CHROME.guard + CHROME.sort + CHROME.sortOrder + CHROME.filter;
    const widestChip = Math.max(...chipLabels.map(chipWidth));
    const chip = layout === 'inline' ? widestChip + CHIP_BOX.gapBefore : Math.max(0, widestChip - labelW);
    const headerMin = Math.ceil(labelW + chrome + chip);
    return { label: Math.ceil(labelW), chrome: Math.ceil(chrome), chip: Math.ceil(chip), cell: METRIC_CELL_MIN, min: Math.max(headerMin, METRIC_CELL_MIN) };
}
//# sourceMappingURL=widths.js.map