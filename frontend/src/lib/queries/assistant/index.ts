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

/** A read-only assistant tool the browser's own agent may call (WebMCP). */
export type AssistantToolSpec = {
	name: string;
	description: string;
	/** JSON Schema as JSON text. */
	inputSchema: string;
	untrustedContent: boolean;
};

export const ASSISTANT_TOOLS_QUERY = gql`
	query AssistantTools {
		assistantTools {
			name
			description
			inputSchema
			untrustedContent
		}
	}
`;

export const RUN_ASSISTANT_TOOL_QUERY = gql`
	query RunAssistantTool($name: String!, $input: String!) {
		runAssistantTool(name: $name, input: $input)
	}
`;

export { useAssistantReply, type AssistantStatus } from './useAssistantReply.svelte';
