/**
 * Stubbed upstreams for the end-to-end tests.
 *
 * These used to intercept the app's own API routes, which was a convenient
 * seam and a slightly dishonest one: the agent loop, the tool registry and
 * every presenter were on the far side of it and never ran. There are no
 * routes any more — the whole thing runs in the browser — so the stubs moved
 * out to the real boundary, which is the four hosts the app actually talks to.
 *
 * What that buys is that a test now exercises the same code the reader does:
 * the model's stream is parsed by the real adapter, the tool call is dispatched
 * through the real registry, and the card on screen is drawn by the tool's own
 * presenter rather than by a fixture pretending to be one.
 */

import type { Page, Route } from '@playwright/test';

export const GOOD_KEY = 'sk-test000000000000000000000000000000000000';

export const MODELS = {
	models: ['gpt-5.6-luna', 'gpt-4.1-mini'],
	defaultModel: 'gpt-5.6-luna',
	realtimeAvailable: true
};

// ------------------------------------------------------- the model's stream

/** One thing the model does: say something, or call a tool. */
export type Frame = { text: string } | { call: { name: string; args?: unknown; id?: string } };

/**
 * A Responses API event stream, as the adapter expects to read it.
 *
 * Only the events the adapter acts on — a text delta, and the pair that opens
 * and closes a function call. Anything else it ignores, so anything else would
 * only be noise in a fixture.
 */
export function responsesStream(frames: Frame[]): string {
	const lines: string[] = [];
	let counter = 0;

	const send = (type: string, body: Record<string, unknown>) =>
		lines.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`);

	for (const frame of frames) {
		if ('text' in frame) {
			send('response.output_text.delta', { delta: frame.text });
			continue;
		}
		const id = frame.call.id ?? `call_${(counter += 1)}`;
		send('response.output_item.added', {
			item: { id, type: 'function_call', call_id: id, name: frame.call.name }
		});
		send('response.function_call_arguments.done', {
			item_id: id,
			arguments: JSON.stringify(frame.call.args ?? {})
		});
	}

	send('response.completed', {});
	return lines.join('');
}

/** Reply with these frames once, then fall through to plain prose. */
function scriptedModel(scripts: Frame[][]): (route: Route) => Promise<void> {
	let turn = 0;
	return async (route) => {
		const frames = scripts[Math.min(turn, scripts.length - 1)];
		turn += 1;
		await route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: responsesStream(frames)
		});
	};
}

// ------------------------------------------------------------------- eCFR

const SECTIONS = [
	{
		identifier: '1.274-5',
		label: '§ 1.274-5 Substantiation requirements.',
		label_description: 'Substantiation requirements.',
		title: '26',
		body:
			'No deduction shall be allowed for travel away from home unless the taxpayer ' +
			'substantiates the amount, time, place and business purpose of the expenditure.'
	},
	{
		identifier: '1.162-17',
		label: '§ 1.162-17 Reporting and substantiation of certain business expenses of employees.',
		label_description: 'Reporting and substantiation of certain business expenses of employees.',
		title: '26',
		body: 'An employee adequately accounts by submitting a written expense account.'
	}
];

/** The shape the title-structure index reads, cut down to two sections. */
const STRUCTURE = {
	type: 'title',
	identifier: '26',
	label: 'Title 26',
	children: [
		{
			type: 'chapter',
			identifier: 'I',
			label: 'Chapter I — Internal Revenue Service',
			children: SECTIONS.map((section) => ({
				type: 'section',
				identifier: section.identifier,
				label: section.label,
				label_description: section.label_description,
				reserved: false
			}))
		}
	]
};

function sectionXml(identifier: string): string {
	const section = SECTIONS.find((candidate) => candidate.identifier === identifier) ?? SECTIONS[0];
	return `<?xml version="1.0"?><DIV8 N="${section.identifier}" TYPE="SECTION"><HEAD>${section.label}</HEAD><P>${section.body}</P></DIV8>`;
}

// -------------------------------------------------------------------- setup

/**
 * Intercept every host the app reaches for.
 *
 * A route that is not stubbed is a test talking to the internet, so the last
 * rule aborts anything unrecognised rather than letting it through quietly.
 */
export async function stubApi(
	page: Page,
	options: { validKey?: string; scripts?: Frame[][] } = {}
) {
	const valid = options.validKey ?? GOOD_KEY;
	const scripts = options.scripts ?? [
		[
			{
				call: {
					name: 'search_regulations',
					args: { query: 'substantiation requirements', title: 26 }
				}
			}
		],
		[
			{ text: 'Travel deductions turn on **26 CFR § 1.274-5**. ' },
			{ text: 'You need the amount, time, place and business purpose.' }
		]
	];

	/*
	 * Registered first, and therefore matched last: Playwright tries routes in
	 * the reverse order they were added. Anything the rules below do not claim
	 * is a test reaching the real internet by accident.
	 */
	await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());

	await page.route('**/api.openai.com/v1/models', async (route) => {
		const auth = route.request().headers()['authorization'] ?? '';
		if (!auth.endsWith(valid)) {
			await route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ error: { message: 'Incorrect API key provided.' } })
			});
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				data: [...MODELS.models, 'gpt-realtime-2.1', 'text-embedding-3-large'].map((id) => ({ id }))
			})
		});
	});

	await page.route('**/api.openai.com/v1/responses', scriptedModel(scripts));

	await page.route('**/api.openai.com/v1/realtime/client_secrets', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ value: 'ek_test', expires_at: Date.now() / 1000 + 60 })
		});
	});

	await page.route('**/www.ecfr.gov/api/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/structure')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(STRUCTURE)
			});
			return;
		}
		if (url.includes('/full/')) {
			const identifier = /section=([^&]+)/.exec(url)?.[1] ?? SECTIONS[0].identifier;
			await route.fulfill({
				status: 200,
				contentType: 'application/xml',
				body: sectionXml(decodeURIComponent(identifier))
			});
			return;
		}
		if (url.includes('/search/')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					results: SECTIONS.map((section) => ({
						hierarchy: { title: section.title, section: section.identifier },
						hierarchy_headings: { title: 'Title 26', section: section.label },
						headings: { section: section.label_description },
						full_text_excerpt: section.body
					}))
				})
			});
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
	});

	await page.route('**/www.federalregister.gov/api/**', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ count: 0, results: [] })
		});
	});
}

/** Get past the key gate into the app proper. */
export async function unlock(page: Page, key = GOOD_KEY) {
	await page.getByLabel('OpenAI API key').fill(key);
	// "Start" also matches the microphone button's accessible name.
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await page.getByRole('heading', { name: 'What are you checking?' }).waitFor();
}
