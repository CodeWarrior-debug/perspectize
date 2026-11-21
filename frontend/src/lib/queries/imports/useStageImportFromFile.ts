import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { STAGE_IMPORT_FROM_FILE, type StageImportFromFileResponse } from './index';
import { createImportJobOnSuccess } from './useImportJobMutations';
import type { StageImportFileInput } from '#lib/utils/importFile.js';

/** Admin: stages a parsed candidates file as a new import. A new job only changes the imports lists. */
export function useStageImportFromFile() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: StageImportFileInput) =>
			graphqlRequest<StageImportFromFileResponse>(STAGE_IMPORT_FROM_FILE, { input: vars }),
		onSuccess: () => createImportJobOnSuccess(client),
	}));
}
