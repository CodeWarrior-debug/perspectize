/**
 * Single seam between content-type detection and the Bible reference parser
 * (plan Task C1, `./bible`). Chapter-only refs ("Psalm 23") resolve to a whole
 * chapter range; out-of-range/unparseable input returns null.
 */
export { parseReference, type PassageRange } from './bible';
