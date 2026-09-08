/**
 * Text-mode transport.
 *
 * There is no transport any more. This used to post a turn to a route and read
 * an event stream back; the route ran the agent loop, which is plain
 * fetch-driven TypeScript with nothing in it a browser cannot do. So the loop
 * runs here, and what was a network hop is a function call.
 *
 * The signature is unchanged because the caller's job is unchanged: hand over a
 * turn, read `AgentEvent`s as they happen, and abort by signal.
 */

import type { AgentEvent } from '$lib/harness';
import type { StoredDocument } from '$lib/plugins';
import { describeError, runTurn, type Brain } from './openai';

export interface ChatTurn {
	apiKey: string;
	model: string;
	messages: { role: 'user' | 'assistant'; content: string }[];
	documents: StoredDocument[];
	/** Knowledge, skills and the tool packs those skills need. */
	brain?: Brain;
	/** Interview questions already drawn, so the next one is a new one. */
	askedQuestions?: readonly string[];
	/** A question is on screen and unmarked, so another may not be asked. */
	openQuestion?: boolean;
	signal?: AbortSignal;
}

/** Yields one `AgentEvent` per step of the turn. */
export async function* streamTurn(turn: ChatTurn): AsyncGenerator<AgentEvent> {
	try {
		yield* runTurn({
			apiKey: turn.apiKey,
			model: turn.model,
			messages: turn.messages,
			documents: turn.documents,
			brain: turn.brain,
			askedQuestions: turn.askedQuestions,
			openQuestion: turn.openQuestion,
			signal: turn.signal
		});
	} catch (cause) {
		// An abort is the caller stopping the turn, not a failure to report.
		if (turn.signal?.aborted) return;
		yield { type: 'error', message: describeError(cause) };
	}
}
