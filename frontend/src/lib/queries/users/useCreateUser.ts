import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_USER, type CreateUserInput, type CreateUserResponse } from './index';
import { queryKeys } from '../keys';

export function useCreateUser() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: CreateUserInput) => {
			return graphqlRequest<CreateUserResponse>(CREATE_USER, { input });
		},
		onSuccess: (data: CreateUserResponse) => {
			toast.success(`Created user: ${data.createUser.username}`);
			queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
		},
		onError: (err: Error) => {
			const message = err.message.toLowerCase();
			if (message.includes('already exists')) {
				toast.error('A user with that username already exists');
			} else {
				toast.error('Failed to create user. Please try again.');
			}
		},
	}));
}
