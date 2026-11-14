/**
 * One look for every action button in a details dialog (Compare, Add to plan,
 * Update source data, Save title). Fixed height so a text-only button, a button
 * with an icon and a button whose icon turns into a spinner all line up, and
 * nowrap so a label never breaks onto two lines and makes one button taller.
 * Icons inside are sized here too, so callers can't drift to a different size.
 */
export const MODAL_ACTION_CLASS =
	'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-primary px-3.5 text-[13px] leading-none font-semibold whitespace-nowrap text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-3.5 [&_svg]:flex-none';
