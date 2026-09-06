/**
 * Drawing from the interview bank.
 *
 * The bank is 192 fixed questions, so what is worth testing is not the content
 * but the drawing: that a filter narrows it, that the same question does not
 * come round twice, and that the marking note the bank supplies reaches her and
 * not the screen.
 */

import { describe, expect, it } from 'vitest';
import { createHarness } from './index.js';
import type { ToolRegistry } from '$lib/harness';

async function drawer(asked: string[] = [], openQuestion = false) {
	const ctx = await createHarness({ packs: ['ecfr', 'interview'], askedQuestions: asked, openQuestion });
	const tools = ctx.require<ToolRegistry>('tools');
	let call = 0;

	const run = (name: string, args: object) => {
		call += 1;
		return tools.execute({
			callId: `c${call}`,
			name,
			arguments: args as never,
			signal: AbortSignal.timeout(10_000)
		});
	};

	return {
		/**
		 * Draw one, marking whatever is open first.
		 *
		 * Only one question may be on screen at a time, which is enforced rather
		 * than asked for — so a test that wants a second question has to close
		 * the first, exactly as she does.
		 */
		async draw(args: Record<string, string> = {}) {
			await run('score_answer', { verdict: 'correct', feedback: 'Moving on.' });
			return run('draw_interview_question', args);
		},
		run,
		dispose: () => ctx.dispose()
	};
}

describe('the interview bank', () => {
	it('puts a question on screen with its hints and its answer', async () => {
		const { draw, dispose } = await drawer();
		const result = await draw();

		expect(result.isError).toBe(false);
		const view = result.view as Extract<typeof result.view, { card: 'question' }>;
		expect(view.card).toBe('question');
		expect(view.question.prompt.length).toBeGreaterThan(20);
		expect(view.question.answer.length).toBeGreaterThan(40);
		expect(view.question.hints.length).toBeGreaterThan(0);
		dispose();
	});

	it('stays inside a topic when it is given one', async () => {
		const { draw, dispose } = await drawer();
		for (let attempt = 0; attempt < 4; attempt += 1) {
			const result = await draw({ topic: 'bank-reconciliation' });
			const view = result.view as Extract<typeof result.view, { card: 'question' }>;
			expect(view.question.topic).toBe('bank reconciliation');
		}
		dispose();
	});

	it('does not put the same question twice in one session', async () => {
		const { draw, dispose } = await drawer();
		const seen = new Set<string>();
		for (let attempt = 0; attempt < 12; attempt += 1) {
			const result = await draw({ level: 'Foundational' });
			const view = result.view as Extract<typeof result.view, { card: 'question' }>;
			expect(seen.has(view.question.slug!)).toBe(false);
			seen.add(view.question.slug!);
		}
		dispose();
	});

	it('skips what an earlier request already asked', async () => {
		const first = await drawer();
		const opener = (await first.draw()).view as Extract<
			Awaited<ReturnType<typeof first.draw>>['view'],
			{ card: 'question' }
		>;
		first.dispose();

		// A voice call is its own request with its own context: without the
		// browser handing the history back, this is where a repeat would happen.
		const second = await drawer([opener.question.slug!]);
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const next = (await second.draw()).view as typeof opener;
			expect(next.question.slug).not.toBe(opener.question.slug);
		}
		second.dispose();
	});

	it('would rather repeat than leave a narrow topic', async () => {
		// Only three questions carry this topic. Asked for a fourth, staying on
		// the subject matters more than never repeating — she would have moved
		// on long before it came round anyway.
		const { draw, dispose } = await drawer();
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const view = (await draw({ topic: 'bank-reconciliation' })).view as Extract<
				Awaited<ReturnType<typeof draw>>['view'],
				{ card: 'question' }
			>;
			expect(view.question.topic).toBe('bank reconciliation');
		}
		dispose();
	});

	it('refuses a second question while the first is unmarked', async () => {
		const { run, dispose } = await drawer([], true);
		const blocked = await run('draw_interview_question', {});

		// Asked politely in four places and she did it anyway: the mark lands on
		// the newest question, so a second one on screen grades their answer to
		// the first against a question they were never asked.
		expect(blocked.isError).toBe(true);
		expect(blocked.content.map((block) => block.text).join(' ')).toContain('score_answer');
		dispose();
	});

	it('lets the next one through once the open one is marked', async () => {
		const { run, dispose } = await drawer([], true);
		await run('score_answer', { verdict: 'incorrect', feedback: 'Skipped.' });
		expect((await run('draw_interview_question', {})).isError).toBe(false);
		dispose();
	});

	it('tells her what to mark against, and does not put it on screen', async () => {
		const { draw, dispose } = await drawer();
		const result = await draw();
		const view = result.view as Extract<typeof result.view, { card: 'question' }>;
		const spoken = result.content.map((block) => block.text).join(' ');

		// The bank's note on what an interviewer is listening for is the whole
		// point of drawing rather than inventing — but showing it to the
		// candidate would be showing them the mark scheme.
		expect(spoken).toContain('listening for');
		expect(JSON.stringify(view)).not.toContain('listening for');
		dispose();
	});
});
