import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import {
	CLOSE_IMPORT_JOB,
	CREATE_IMPORT_JOB,
	REVIEW_IMPORT_JOB,
	type CloseImportJobResponse,
	type CreateImportSourceInput,
	type CreateImportJobResponse,
	type ReviewImportJobResponse,
} from './index';
import { queryKeys } from '../keys';

export interface CreateImportJobVars {
	name: string;
	sources: CreateImportSourceInput[];
}

export interface ReviewImportJobVars {
	jobId: string;
	approve: boolean;
	note?: string;
}

export interface CloseImportJobVars {
	jobId: string;
	closed: boolean;
}

/** A new import or request only changes the imports list (every includeClosed variant). */
export function createImportJobOnSuccess(client: QueryClient) {
	return client.invalidateQueries({ queryKey: queryKeys.imports.lists() });
}

/** Reviewing or closing changes the list and that import's sheet; nothing else. */
export function importJobChangedOnSuccess(client: QueryClient, jobId: string) {
	return Promise.all([
		client.invalidateQueries({ queryKey: queryKeys.imports.lists() }),
		client.invalidateQueries({ queryKey: queryKeys.imports.detail(jobId) }),
	]);
}

/** Requests an import (an admin's starts listing at once). */
export function useCreateImportJob() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: CreateImportJobVars) =>
			graphqlRequest<CreateImportJobResponse>(CREATE_IMPORT_JOB, {
				input: {
					name: vars.name,
					sources: vars.sources.map((s) => ({ sourceType: s.sourceType, ref: s.ref, role: s.role ?? null })),
				},
			}),
		onSuccess: () => createImportJobOnSuccess(client),
	}));
}

/** Admin: approve (start listing) or decline a request. */
export function useReviewImportJob() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: ReviewImportJobVars) =>
			graphqlRequest<ReviewImportJobResponse>(REVIEW_IMPORT_JOB, {
				input: { jobId: Number(vars.jobId), approve: vars.approve, note: vars.note ?? null },
			}),
		onSuccess: (_d: ReviewImportJobResponse, vars: ReviewImportJobVars) =>
			importJobChangedOnSuccess(client, vars.jobId),
	}));
}

/** Admin: close (hide from non-admins, read-only) or reopen an import. */
export function useCloseImportJob() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: CloseImportJobVars) =>
			graphqlRequest<CloseImportJobResponse>(CLOSE_IMPORT_JOB, {
				input: { jobId: Number(vars.jobId), closed: vars.closed },
			}),
		onSuccess: (_d: CloseImportJobResponse, vars: CloseImportJobVars) => importJobChangedOnSuccess(client, vars.jobId),
	}));
}
