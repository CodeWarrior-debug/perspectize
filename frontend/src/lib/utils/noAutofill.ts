/**
 * Attributes that ask password managers not to offer to fill a field. `autocomplete="off"` alone
 * is ignored by LastPass, 1Password and Bitwarden, each of which has its own opt-out. Spread it
 * onto inputs that are never a login or an identity (pickers, search boxes, a todo's title):
 * `<input {...NO_AUTOFILL} />`. Leave it off the real sign-up and profile fields.
 */
export const NO_AUTOFILL = {
	autocomplete: 'off',
	'data-lpignore': 'true',
	'data-1p-ignore': 'true',
	'data-bwignore': 'true',
} as const;
