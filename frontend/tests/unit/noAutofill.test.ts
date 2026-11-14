import { describe, it, expect } from 'vitest';
import { NO_AUTOFILL } from '$lib/utils/noAutofill';

describe('NO_AUTOFILL', () => {
	it('asks LastPass, 1Password and Bitwarden not to offer to fill a field, besides autocomplete=off (which they ignore)', () => {
		expect(NO_AUTOFILL).toEqual({
			autocomplete: 'off',
			'data-lpignore': 'true',
			'data-1p-ignore': 'true',
			'data-bwignore': 'true',
		});
	});
});
