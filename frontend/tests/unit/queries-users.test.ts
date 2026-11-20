import { describe, it, expect } from 'vitest';
import {
	LIST_USERS,
	CREATE_USER,
	ME,
	type User,
	type UsersResponse,
	type CreateUserInput,
	type CreateUserResponse,
	type Me,
} from '#lib/queries/users/index.js';

describe('User Queries', () => {
	describe('Type exports', () => {
		it('exports User interface', () => {
			const user: User = { id: '1', username: 'test' };
			expect(user).toBeDefined();
		});

		it('exports UsersResponse interface', () => {
			const response: UsersResponse = { users: [{ id: '1', username: 'test' }] };
			expect(response).toBeDefined();
		});

		it('exports CreateUserInput interface with required username and optional email', () => {
			const input: CreateUserInput = { username: 'newuser' };
			expect(input.username).toBeDefined();
			expect(input.email).toBeUndefined();

			const inputWithEmail: CreateUserInput = { username: 'newuser', email: 'user@example.com' };
			expect(inputWithEmail.username).toBeDefined();
			expect(inputWithEmail.email).toBeDefined();
		});

		it('exports CreateUserResponse interface', () => {
			const response: CreateUserResponse = {
				createUser: { id: '1', username: 'newuser' },
			};
			expect(response).toBeDefined();
		});

		it('exports Me interface with a role and onboarding', () => {
			const me: Me = {
				id: '1',
				username: 'admin',
				role: 'ADMIN',
				onboarding: { version: 0, displayNextSession: true, completedAt: null },
			};
			expect(me.role).toBe('ADMIN');
			expect(me.onboarding.displayNextSession).toBe(true);
		});
	});

	describe('ME', () => {
		it('is exported as a string containing the Me query', () => {
			expect(typeof ME).toBe('string');
			expect(ME).toContain('query Me');
		});

		it('requests id, username, role, and onboarding fields', () => {
			expect(ME).toContain('id');
			expect(ME).toContain('username');
			expect(ME).toContain('role');
			expect(ME).toContain('onboarding');
			expect(ME).toContain('displayNextSession');
			expect(ME).toContain('completedAt');
		});
	});

	describe('LIST_USERS', () => {
		it('is exported as a string', () => {
			expect(typeof LIST_USERS).toBe('string');
		});

		it('contains the users query', () => {
			expect(LIST_USERS).toContain('query ListUsers');
			expect(LIST_USERS).toContain('users');
		});

		it('requests id and username fields only', () => {
			expect(LIST_USERS).toContain('id');
			expect(LIST_USERS).toContain('username');
			expect(LIST_USERS).not.toContain('email');
		});

		it('does not request unnecessary timestamp fields', () => {
			expect(LIST_USERS).not.toContain('createdAt');
			expect(LIST_USERS).not.toContain('updatedAt');
		});
	});

	describe('CREATE_USER', () => {
		it('is exported as a string', () => {
			expect(typeof CREATE_USER).toBe('string');
		});

		it('contains the CreateUser mutation operation', () => {
			expect(CREATE_USER).toContain('mutation CreateUser');
		});

		it('contains createUser field', () => {
			expect(CREATE_USER).toContain('createUser');
		});

		it('requests id and username fields in response', () => {
			expect(CREATE_USER).toContain('id');
			expect(CREATE_USER).toContain('username');
		});

		it('does not request email in the response', () => {
			expect(CREATE_USER).not.toContain('email');
		});
	});
});
