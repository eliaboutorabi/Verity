/**
 * The exam, as the browser runs it.
 *
 * What matters here is the withholding. She writes the question, its hints and
 * its answer in one call; if any of that leaks before it is asked for, the
 * exercise is worthless — so the rules about what is visible when are worth
 * stating as tests rather than trusting to a prompt.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { study } from './study.svelte.js';

const question = (id: string, hints = ['First nudge', 'Second nudge']) => ({
	id,
	area: 'Federal taxation of individuals',
	topic: 'Passive activity losses',
	skill: 'application' as const,
	prompt: 'A taxpayer materially participates for 480 hours. Are the losses passive?',
	hints,
	answer: 'No — 500 hours is only one of seven tests, and this one is met another way.',
	citation: '26 CFR § 1.469-5T'
});

describe('the exam', () => {
	beforeEach(() => study.clear());

	it('shows nothing but the question until something is asked for', () => {
		study.ask(question('q1'));
		const asked = study.byId('q1')!;

		expect(asked.hintsShown).toBe(0);
		expect(asked.answerShown).toBe(false);
		expect(asked.verdict).toBeUndefined();
	});

	it('lets hints out one at a time, in the order they were written', () => {
		study.ask(question('q1'));

		expect(study.revealHint()).toBe('First nudge');
		expect(study.byId('q1')!.hintsShown).toBe(1);
		expect(study.revealHint()).toBe('Second nudge');
		// And no further: asking again cannot conjure a third.
		expect(study.revealHint()).toBeNull();
		expect(study.byId('q1')!.hintsShown).toBe(2);
	});

	it('reveals against the open question when nobody says which', () => {
		study.ask(question('q1'));
		study.ask(question('q2', ['Only hint']));

		study.revealHint();
		expect(study.byId('q1')!.hintsShown).toBe(0);
		expect(study.byId('q2')!.hintsShown).toBe(1);
	});

	it('shows the answer alongside a mark, because a mark alone teaches nothing', () => {
		study.ask(question('q1'));
		study.score('partly', 'Right treatment, wrong test.');

		const asked = study.byId('q1')!;
		expect(asked.verdict).toBe('partly');
		expect(asked.answerShown).toBe(true);
		expect(asked.feedback).toBe('Right treatment, wrong test.');
	});

	it('counts the run, and does not count the question still open', () => {
		study.ask(question('q1'));
		study.score('correct', 'Yes.');
		study.ask(question('q2'));
		study.score('incorrect', 'No.');
		study.ask(question('q3'));
		study.revealHint();

		expect(study.marked).toHaveLength(2);
		expect(study.correct).toBe(1);
		expect(study.hintsUsed).toBe(1);
	});

	it('ignores a question it has already been given', () => {
		study.ask(question('q1'));
		study.revealHint();
		study.ask(question('q1'));

		// A replayed tool call must not wipe what the candidate has already seen.
		expect(study.asked).toHaveLength(1);
		expect(study.byId('q1')!.hintsShown).toBe(1);
	});

	it('does nothing at all when there is no question up', () => {
		expect(study.revealHint()).toBeNull();
		expect(study.revealAnswer()).toBeNull();
		expect(() => study.score('correct', 'nothing to mark')).not.toThrow();
		expect(study.isEmpty).toBe(true);
	});
});
