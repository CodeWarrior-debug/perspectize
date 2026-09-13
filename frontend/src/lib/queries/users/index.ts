import { gql } from 'graphql-request';

export interface User {
	id: string;
	username: string;
}

export interface UsersResponse {
	users: User[];
}

export const LIST_USERS = gql`
	query ListUsers {
		users {
			id
			username
		}
	}
`;

export interface CreateUserInput {
	username: string;
	email?: string;
}

export interface CreateUserResponse {
	createUser: User;
}

export const CREATE_USER = gql`
	mutation CreateUser($input: CreateUserInput!) {
		createUser(input: $input) {
			id
			username
		}
	}
`;

export type UserRole = 'ADMIN' | 'SENTINEL' | 'DEFAULT';

/** Thin onboarding fields from backend `me.onboarding` (completedAt is RFC3339 or null). */
export interface UserOnboarding {
	version: number;
	displayNextSession: boolean;
	completedAt: string | null;
}

export interface Me {
	id: string;
	username: string;
	role: UserRole;
	onboarding: UserOnboarding;
}

export interface MeResponse {
	me: Me | null;
}

export const ME = gql`
	query Me {
		me {
			id
			username
			role
			onboarding {
				version
				displayNextSession
				completedAt
			}
		}
	}
`;

export interface MarkOnboardingSeenResponse {
	markOnboardingSeen: UserOnboarding;
}

export const MARK_ONBOARDING_SEEN = gql`
	mutation MarkOnboardingSeen($version: Int!) {
		markOnboardingSeen(version: $version) {
			version
			displayNextSession
			completedAt
		}
	}
`;

export interface SetOnboardingDisplayNextSessionResponse {
	setOnboardingDisplayNextSession: UserOnboarding;
}

export const SET_ONBOARDING_DISPLAY_NEXT_SESSION = gql`
	mutation SetOnboardingDisplayNextSession($displayNextSession: Boolean!) {
		setOnboardingDisplayNextSession(displayNextSession: $displayNextSession) {
			version
			displayNextSession
			completedAt
		}
	}
`;
