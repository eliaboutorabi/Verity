/**
 * Harness assembly.
 *
 * Everything above is a plugin; this is the only file that knows the full set.
 * Mount order is bottom-up because dependencies are declared, not sequenced:
 * services first, then the plugins that inject them.
 */

import {
	agentPlugin,
	Context,
	deadlinePlugin,
	llmPlugin,
	openaiPlugin,
	retryPlugin,
	toolsPlugin,
	type ToolRegistry
} from '$lib/harness';
import { documentsPlugin, type DocumentStore, type StoredDocument } from './documents.js';
import { ecfrPlugin } from './ecfr.js';
import { federalRegisterPlugin } from './federal-register.js';
import { highlightPlugin } from './highlight.js';
import { loopGuard, type PriorCall } from './loop-guard.js';
import { reviewPlugin } from './review.js';
import { verifyPlugin } from './verify.js';
import { criticPlugin } from './critic.js';
import { briefPlugin } from './brief.js';
import { PACK_IDS, type PackId } from '$lib/packs';
import { openQuestionGuard, studyPlugin } from './study.js';
import { interviewPlugin } from './interview.js';

/** The plugins a caller can mount: tool packs, plus the optional critic. */
export { PACK_IDS, type PackId } from '$lib/packs';

/**
 * What a plugin needs to make a model call of its own.
 *
 * The critic runs a second, cheaper request against the same account. Passing
 * it through a service rather than a prop keeps it out of every signature
 * between here and there, and it is dropped with the context at turn's end.
 */
export interface Credentials {
	apiKey: string;
	/** The model the turn itself is using; a check may pick a cheaper one. */
	model: string;
}

export interface HarnessOptions {
	/** Documents to load into the session before the first turn. */
	documents?: StoredDocument[];
	/**
	 * Which tool packs to mount. Omitted means all of them.
	 *
	 * Switching a skill off in settings withholds the tools it owns rather than
	 * merely asking the model not to use them — an instruction the model is
	 * free to weigh against everything else in the prompt.
	 */
	packs?: readonly PackId[];
	/** Lets the critic make its own request. Omitted disables it. */
	credentials?: Credentials;
	/**
	 * Calls this conversation has already made.
	 *
	 * Only the voice path supplies these: its calls arrive as separate stateless
	 * requests, so without them the loop guard starts every call with no memory.
	 */
	priorCalls?: readonly PriorCall[];
	/** Interview questions already put to this candidate, so none repeats. */
	askedQuestions?: readonly string[];
	/** A question from an earlier turn is on screen and has not been marked. */
	openQuestion?: boolean;
}

/**
 * Boot a fully-wired harness. Callers own the returned context and must
 * `dispose()` it — every registration unwinds with it.
 */
export async function createHarness(options: HarnessOptions = {}): Promise<Context> {
	const ctx = new Context();

	await ctx.use(toolsPlugin, llmPlugin, documentsPlugin, openaiPlugin, agentPlugin);

	// Failures that resolve themselves, handled before anything else sees them.
	await ctx.use(retryPlugin, deadlinePlugin());

	if (options.credentials) ctx.provide('credentials', options.credentials);

	const packs = new Set<PackId>(options.packs ?? PACK_IDS);
	// The CFR is the whole point; a caller cannot leave the app with no way to
	// look anything up.
	packs.add('ecfr');
	// The interview bank draws questions; the study pack is what reveals and
	// marks them. A question you cannot mark is not an interview, so asking for
	// one without the other is always a mistake rather than a choice.
	if (packs.has('interview')) packs.add('study');

	if (packs.has('ecfr')) await ctx.plugin(ecfrPlugin);
	if (packs.has('federal-register')) await ctx.plugin(federalRegisterPlugin);
	if (packs.has('brief')) await ctx.plugin(briefPlugin);
	if (packs.has('study')) await ctx.plugin(studyPlugin);
	// Seeded with what has already been drawn, for the same reason the loop
	// guard is: a voice turn arrives as its own stateless request, so without
	// this every question would be drawn from a bank with no memory.
	if (packs.has('interview')) {
		await ctx.plugin(interviewPlugin(options.askedQuestions ?? []));
	}
	// Both packs put questions on the same screen, and there is only one screen.
	if (packs.has('study') || packs.has('interview')) {
		await ctx.plugin(openQuestionGuard(options.openQuestion ?? false));
	}
	if (packs.has('review')) {
		await ctx.plugin(reviewPlugin);
		await ctx.plugin(highlightPlugin);
	}

	await ctx.plugin(loopGuard(options.priorCalls));

	// The mechanical check is free and never wrong, so it is not optional.
	// The critic costs a model call, so it is a skill the user can switch off.
	await ctx.plugin(verifyPlugin);
	if (packs.has('critic') && options.credentials) await ctx.plugin(criticPlugin);

	const documents = ctx.require<DocumentStore>('documents');
	for (const document of options.documents ?? []) documents.put(document);

	return ctx;
}

/** The tool schemas, for handing to a realtime session at mint time. */
export async function toolSchemas(packs?: readonly PackId[]) {
	const ctx = await createHarness({ packs });
	try {
		return ctx.require<ToolRegistry>('tools').schemas();
	} finally {
		ctx.dispose();
	}
}

export { MAX_DOCUMENT_CHARS, type DocumentStore, type StoredDocument } from './documents.js';
export { REVIEW_RULES, scanDocument, type ReviewRule, type Severity } from './review-rules.js';
export type { PriorCall } from './loop-guard.js';
export { EXAM_AREAS } from './study.js';
export { INTERVIEW_TOPICS } from './interview.js';
