/**
 * Everything that used to be a server route.
 *
 * The app had five: it ran the agent, executed voice tool calls, minted a
 * realtime secret, listed the key's models, and forwarded a PDF to Mistral.
 * None of them needed to exist. Each upstream this app talks to —
 * eCFR, the Federal Register, OpenAI and Mistral — answers a cross-origin
 * request with `Access-Control-Allow-Origin: *`, and the harness is plain
 * fetch-driven TypeScript with nothing Node-only in it. The routes were a
 * proxy for the sake of being a proxy.
 *
 * Removing them is not merely a deployment convenience. It is the honest
 * version of what the app already claimed: bring your own key, and it stays in
 * your browser. Until now the key travelled to a server on every turn and was
 * trusted not to be written down. Now there is no server to trust.
 *
 * What is lost is the validation those routes did on their way in. That was
 * guarding a server against whatever a browser sent it; with the two collapsed
 * into one, it was guarding the browser against itself.
 */

import {
	createHarness,
	toolSchemas,
	type PackId,
	type StoredDocument,
	type PriorCall
} from '$lib/plugins';
import {
	DEFAULT_MODEL,
	openaiAdapter,
	selectChatModels,
	type AgentEvent,
	type AgentService,
	type ChatMessage,
	type ToolRegistry,
	type ToolResultView
} from '$lib/harness';
import { composeInstructions, TEXT_INSTRUCTIONS, VOICE_INSTRUCTIONS } from '$lib/prompts';
import { CHARACTERS, isCharacterId, REALTIME_MODEL, type CharacterId } from '$lib/voices';

/** Knowledge, skills and packs, exactly as the settings state produces them. */
export interface Brain {
	knowledge: string;
	skills: { name: string; instructions: string }[];
	packs: PackId[];
}

const EMPTY_BRAIN: Brain = { knowledge: '', skills: [], packs: ['ecfr'] };

/**
 * One readable sentence out of whatever went wrong.
 *
 * A caller sees this, so it has to be a sentence rather than a stack.
 */
export function describeError(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return typeof cause === 'string' ? cause : 'Something went wrong.';
}

// ------------------------------------------------------------------- models

export interface ModelAvailability {
	models: string[];
	defaultModel: string;
	realtimeAvailable: boolean;
}

/**
 * What this key can actually reach.
 *
 * Bring-your-own-key means access differs per account, so the picker is built
 * from the caller's own model list intersected with the ones worth offering,
 * rather than from a hardcoded menu that might be half-unusable.
 */
export async function listModels(apiKey: string, signal?: AbortSignal): Promise<ModelAvailability> {
	const available = await openaiAdapter.listModels!(apiKey, signal ?? AbortSignal.timeout(15_000));
	const models = selectChatModels(available);

	return {
		models: models.length ? models : [DEFAULT_MODEL],
		// Luna is the default: a turn here is several tool calls and a citation
		// that has to be right, which is worth more than the last few hundred
		// milliseconds. The picker offers everything else the key can reach.
		defaultModel: models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0] ?? DEFAULT_MODEL),
		realtimeAvailable: new Set(available).has(REALTIME_MODEL)
	};
}

// --------------------------------------------------------------- text turns

export interface TurnOptions {
	apiKey: string;
	model: string;
	messages: ChatMessage[];
	documents: StoredDocument[];
	brain?: Brain;
	askedQuestions?: readonly string[];
	openQuestion?: boolean;
	signal?: AbortSignal;
}

/**
 * Run one turn, yielding the agent's events as they happen.
 *
 * The same loop the route ran, in the tab that asked for it. `done` used to be
 * trimmed on the way out because it carries the whole internal message list and
 * the client only needs to know the turn ended; that is still true, so it is
 * still trimmed.
 */
export async function* runTurn(options: TurnOptions): AsyncGenerator<AgentEvent> {
	const brain = options.brain ?? EMPTY_BRAIN;
	const ctx = await createHarness({
		documents: options.documents,
		packs: brain.packs,
		askedQuestions: options.askedQuestions ?? [],
		openQuestion: options.openQuestion ?? false,
		// The critic makes its own call, on the same key.
		credentials: { apiKey: options.apiKey, model: options.model }
	});

	try {
		for await (const event of ctx.require<AgentService>('agent').run({
			messages: [
				{ role: 'system', content: composeInstructions(TEXT_INSTRUCTIONS, brain) },
				...options.messages
			],
			apiKey: options.apiKey,
			model: options.model,
			signal: options.signal
		})) {
			// `done` carries the whole internal message list, tool calls and all.
			// The caller only needs to know the turn ended, and whether the check
			// sent her back to revise it.
			yield event.type === 'done' ? { type: 'done', messages: [], revised: event.revised } : event;
		}
	} finally {
		ctx.dispose();
	}
}

// -------------------------------------------------------------- voice tools

export interface ToolCallOptions {
	callId: string;
	name: string;
	arguments: Record<string, never>;
	documents: StoredDocument[];
	brain?: Brain;
	priorCalls?: readonly PriorCall[];
	askedQuestions?: readonly string[];
	openQuestion?: boolean;
	signal?: AbortSignal;
}

export interface ToolCallOutcome {
	output: string;
	isError: boolean;
	view?: ToolResultView;
	durationMs: number;
}

/**
 * Execute one function call from a live voice session.
 *
 * Runs at the voice modality, which the tools read: that path pays for every
 * token twice — once in latency before she speaks, once in the risk she reads a
 * breadcrumb out loud — so the renderings are terser than the text ones.
 */
export async function runToolCall(options: ToolCallOptions): Promise<ToolCallOutcome> {
	const brain = options.brain ?? EMPTY_BRAIN;
	const started = performance.now();
	const ctx = await createHarness({
		documents: options.documents,
		packs: brain.packs,
		priorCalls: options.priorCalls ?? [],
		askedQuestions: options.askedQuestions ?? [],
		openQuestion: options.openQuestion ?? false
	});

	try {
		const result = await ctx.require<ToolRegistry>('tools').execute({
			callId: options.callId,
			name: options.name,
			arguments: options.arguments,
			signal: options.signal ?? AbortSignal.timeout(60_000),
			modality: 'voice'
		});

		return {
			output: result.content.map((block) => block.text).join('\n'),
			isError: result.isError,
			view: result.view ?? undefined,
			durationMs: Math.round(performance.now() - started)
		};
	} finally {
		ctx.dispose();
	}
}

// ----------------------------------------------------------------- realtime

export interface RealtimeSecret {
	clientSecret: string;
	expiresAt: number | null;
	model: string;
	character: CharacterId;
	voice: string;
}

/**
 * Mint an ephemeral client secret for a realtime voice session.
 *
 * The session — instructions, voice, turn detection, and the tool schemas
 * straight off the harness registry — is fixed here, at mint time. That used to
 * matter because the client had no say in what the model was told; now the
 * client *is* the thing deciding, so what it buys is that the whole shape of a
 * voice session lives in one legible place rather than being assembled inline
 * where the connection is opened.
 */
export async function mintRealtimeSecret(
	apiKey: string,
	options: { character?: unknown; brain?: Brain; signal?: AbortSignal } = {}
): Promise<RealtimeSecret> {
	const character = isCharacterId(options.character) ? options.character : 'classic';
	const profile = CHARACTERS[character];
	const brain = options.brain ?? EMPTY_BRAIN;

	const session = {
		type: 'realtime',
		model: REALTIME_MODEL,
		output_modalities: ['audio'],
		instructions: `${composeInstructions(VOICE_INSTRUCTIONS, brain)}\n\n${profile.style}`,
		tools: (await toolSchemas(brain.packs)).map((tool) => ({
			type: 'function',
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		})),
		tool_choice: 'auto',
		max_output_tokens: 4096,
		audio: {
			input: {
				noise_reduction: { type: 'near_field' },
				transcription: { model: 'gpt-4o-mini-transcribe' },
				turn_detection: {
					type: 'server_vad',
					threshold: 0.45,
					prefix_padding_ms: 300,
					silence_duration_ms: 500,
					create_response: true,
					// Barge-in: speaking over Verity cuts her off, as it should.
					interrupt_response: true
				}
			},
			output: { voice: profile.voice }
		}
	};

	let response: Response;
	try {
		response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ session }),
			signal: options.signal ?? AbortSignal.timeout(20_000)
		});
	} catch (cause) {
		throw new Error(`Could not reach OpenAI to start a voice session. ${describeError(cause)}`);
	}

	const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error('That OpenAI API key was rejected. Check the key and try again.');
		}
		if (response.status === 403 || response.status === 404) {
			throw new Error(
				`This key cannot reach the realtime model (${REALTIME_MODEL}). Realtime access is granted per account — the text mode will still work.`
			);
		}
		throw new Error(
			(payload?.error as { message?: string })?.message ?? `OpenAI returned ${response.status}.`
		);
	}

	const value = payload?.value;
	if (typeof value !== 'string') throw new Error('OpenAI did not return a usable client secret.');

	return {
		clientSecret: value,
		expiresAt: typeof payload?.expires_at === 'number' ? payload.expires_at : null,
		model: REALTIME_MODEL,
		character,
		voice: profile.voice
	};
}
