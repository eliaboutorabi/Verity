/**
 * Stubbed API routes for the end-to-end tests.
 *
 * The UI is what these tests are about, so the network is pinned rather than
 * live: no OpenAI key, no calls to two free government APIs on every run, and
 * a card list that is the same on Tuesday as it was on Monday.
 */

import type { Page } from '@playwright/test';

export const GOOD_KEY = 'sk-test000000000000000000000000000000000000';

export const MODELS = {
	models: ['gpt-5.4-mini', 'gpt-4.1-mini'],
	defaultModel: 'gpt-5.4-mini',
	realtimeAvailable: true
};

const SEARCH_VIEW = {
	card: 'results',
	title: 'Title 26 results',
	query: 'substantiation requirements',
	hits: [
		{
			citation: '26 CFR § 1.274-5',
			heading: 'Substantiation requirements.',
			hierarchy: 'Title 26 › Internal Revenue Service › Items Not Deductible',
			url: 'https://www.ecfr.gov/current/title-26/section-1.274-5',
			excerpt: 'Adequate records or sufficient evidence corroborating the taxpayer’s own statement.'
		},
		{
			citation: '26 CFR § 1.162-17',
			heading: 'Reporting and substantiation of certain business expenses of employees.',
			hierarchy: 'Title 26 › Internal Revenue Service › Itemized Deductions',
			url: 'https://www.ecfr.gov/current/title-26/section-1.162-17'
		}
	]
};

const QUESTION_VIEW = {
	card: 'question',
	title: 'Passive activity losses',
	question: {
		id: 'q1',
		area: 'Individuals',
		topic: 'Passive activity losses',
		skill: 'application',
		prompt: 'A taxpayer has a $12,000 rental loss and $8,000 of passive income. What happens?',
		choices: [
			{ label: 'A', text: 'All $12,000 is deductible.' },
			{ label: 'B', text: '$8,000 is absorbed and $4,000 is suspended.' }
		],
		hints: ['Net the passive loss against passive income first.'],
		answer: 'B. The $8,000 of passive income absorbs $8,000 of the loss.',
		citation: '26 CFR § 1.469-2'
	}
};

/** One agent turn that puts a question on screen and waits. */
export function questionStream(): string {
	return [
		{
			type: 'tool-call',
			callId: 'q1',
			name: 'ask_question',
			label: 'Asking a question'
		},
		{ type: 'tool-result', callId: 'q1', name: 'ask_question', isError: false, view: QUESTION_VIEW, durationMs: 90 },
		{ type: 'done' }
	]
		.map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
		.join('');
}

/** One agent turn: a tool call, its result, then prose. */
function chatStream(): string {
	const frames = [
		{
			type: 'tool-call',
			callId: 'c1',
			name: 'search_regulations',
			label: 'Searching the eCFR',
			view: { card: 'search', title: 'Title 26', query: 'substantiation requirements' }
		},
		{
			type: 'tool-result',
			callId: 'c1',
			name: 'search_regulations',
			isError: false,
			view: SEARCH_VIEW,
			durationMs: 412
		},
		{ type: 'text', delta: 'Travel deductions turn on **26 CFR § 1.274-5**. ' },
		{ type: 'text', delta: 'You need the amount, time, place and business purpose.' },
		{ type: 'done' }
	];
	return frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');
}

/** Intercept every API route the app talks to. */
export async function stubApi(page: Page, options: { validKey?: string } = {}) {
	const valid = options.validKey ?? GOOD_KEY;

	await page.route('**/api/models', async (route) => {
		const key = route.request().headers()['x-openai-key'];
		if (key !== valid) {
			await route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'That OpenAI API key was rejected. Check the key and try again.' })
			});
			return;
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MODELS) });
	});

	await page.route('**/api/chat', async (route) => {
		await route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
			body: chatStream()
		});
	});

	await page.route('**/api/realtime', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ clientSecret: 'ek_test', model: 'gpt-realtime-2', voice: 'cedar' })
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
