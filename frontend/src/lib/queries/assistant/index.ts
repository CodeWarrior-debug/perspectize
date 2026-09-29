import { gql } from 'graphql-request';

export type AssistantEvent =
	| { __typename: 'AssistantTextDelta'; text: string }
	| { __typename: 'AssistantToolActivity'; name: string }
	| {
			__typename: 'AssistantDone';
			stop: string;
			citations: string[];
			inputTokens: number;
			outputTokens: number;
	  }
	| { __typename: 'AssistantError'; message: string };

export const ASSISTANT_REPLY_SUBSCRIPTION = gql`
	subscription AssistantReply($input: AssistantAskInput!) {
		assistantReply(input: $input) {
			__typename
			... on AssistantTextDelta {
				text
			}
			... on AssistantToolActivity {
				name
			}
			... on AssistantDone {
				stop
				citations
				inputTokens
				outputTokens
			}
			... on AssistantError {
				message
			}
		}
	}
`;

export { useAssistantReply, type AssistantStatus } from './useAssistantReply.svelte';
