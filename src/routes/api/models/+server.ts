/**
 * Which models this key can actually reach.
 *
 * Bring-your-own-key means access differs per account, so the picker is built
 * from the caller's own model list intersected with the ones worth offering,
 * rather than from a hardcoded menu that might be half-unusable.
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { DEFAULT_MODEL, openaiAdapter, selectChatModels } from '$lib/harness';
import { describeError, requireApiKey } from '$lib/server/request';
import { REALTIME_MODEL } from '$lib/voices';

export const config = { runtime: 'nodejs22.x' };

export const GET: RequestHandler = async ({ request }) => {
	const apiKey = requireApiKey(request);

	let available: string[];
	try {
		available = await openaiAdapter.listModels!(apiKey, AbortSignal.timeout(15_000));
	} catch (cause) {
		error(401, describeError(cause));
	}

	const models = selectChatModels(available);

	return json({
		models: models.length ? models : [DEFAULT_MODEL],
		// Luna is the default: a turn here is several tool calls and a citation
		// that has to be right, which is worth more than the last few hundred
		// milliseconds. The picker offers everything else the key can reach.
		defaultModel: models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0] ?? DEFAULT_MODEL),
		realtimeAvailable: new Set(available).has(REALTIME_MODEL)
	});
};
