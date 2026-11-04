import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import {
	CLOSE_IMPORT_JOB,
	CREATE_IMPORT_JOB,
	REVIEW_IMPORT_JOB,
	UPDATE_IMPORT_JOB_DESCRIPTION,
	type CloseImportJobResponse,
	type CreateImportSourceInput,
	type CreateImportJobResponse,
	type ReviewImportJobResponse,
	type UpdateImportJobDescriptionResponse,
} from './index';
import { queryKeys } from '../keys';

export interface CreateImportJobVars {
	name: string;
	/** Sanitized HTML, or null when there is no visible text. */
	description?: string | null;
	/** May be empty when there is a description. */
	sources: CreateImportSourceInput[];
}

export interface UpdateImportJobDescriptionVars {
	jobId: string;
	/** Sanitized HTML with visible text (the server refuses an empty one). */
	description: string;
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

/**
 * The requester's description changed: the imports lists (every includeClosed
 * variant) and that import's sheet. The mutation's result carries no sources, so
 * it is never written over the cached sheet; the eviction refetches it instead.
 */
export function updateImportJobDescriptionOnSuccess(client: QueryClient, jobId: string) {
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
					description: vars.description ?? null,
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

/** Requester only: set or change the description of their import (not once it is closed). */
export function useUpdateImportJobDescription() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: UpdateImportJobDescriptionVars) =>
			graphqlRequest<UpdateImportJobDescriptionResponse>(UPDATE_IMPORT_JOB_DESCRIPTION, {
				input: { jobId: Number(vars.jobId), description: vars.description },
			}),
		onSuccess: (_d: UpdateImportJobDescriptionResponse, vars: UpdateImportJobDescriptionVars) =>
			updateImportJobDescriptionOnSuccess(client, vars.jobId),
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
