import { beforeEach, describe, expect, it } from 'vitest';
import { brief } from './brief.svelte.js';

const finding = (topic: string, severity: 'high' | 'medium' | 'low' | 'info' = 'info') => ({
	kind: 'finding' as const,
	topic,
	detail: `Something about ${topic}.`,
	severity
});

describe('the brief', () => {
	beforeEach(() => brief.clear());

	it('orders findings by how much they matter', () => {
		brief.add([finding('Low thing', 'low'), finding('Bad thing', 'high'), finding('Middling', 'medium')]);
		expect(brief.findings.map((item) => item.topic)).toEqual(['Bad thing', 'Middling', 'Low thing']);
	});

	it('keeps gaps apart from findings', () => {
		brief.add([finding('A finding'), { kind: 'gap', topic: 'A question', detail: 'why', severity: 'info' }]);
		expect(brief.findings).toHaveLength(1);
		expect(brief.gaps).toHaveLength(1);
	});

	it('does not list the same issue four times over a long conversation', () => {
		brief.add([finding('Worker classification')]);
		brief.add([finding('worker classification  ')]);
		expect(brief.findings).toHaveLength(1);
	});

	it('lets a later pass raise the severity but not lower it', () => {
		brief.add([finding('Worker classification', 'low')]);
		brief.add([finding('Worker classification', 'high')]);
		expect(brief.findings[0].severity).toBe('high');

		brief.add([finding('Worker classification', 'info')]);
		expect(brief.findings[0].severity).toBe('high');
	});

	it('takes the newer wording, because a later pass knows more', () => {
		brief.add([{ ...finding('Meals'), detail: 'First guess.' }]);
		brief.add([{ ...finding('Meals'), detail: 'After reading § 1.274-12.', citation: '26 CFR § 1.274-12' }]);
		expect(brief.findings[0].detail).toBe('After reading § 1.274-12.');
		expect(brief.findings[0].citation).toBe('26 CFR § 1.274-12');
	});

	it('counts what is still outstanding', () => {
		brief.add([finding('One'), finding('Two')]);
		expect(brief.outstanding).toBe(2);
		brief.toggle(brief.findings[0].id);
		expect(brief.outstanding).toBe(1);
	});

	it('exports a memo with the findings, their citations and the open questions', () => {
		brief.add([
			{ ...finding('Worker classification', 'high'), citation: '26 CFR § 31.3121(d)-1' },
			{ kind: 'gap', topic: 'Are they employees?', detail: 'Needs the contracts.', severity: 'info' }
		]);

		const memo = brief.asMarkdown('Harbourline review');
		expect(memo).toContain('# Harbourline review');
		expect(memo).toContain('**Worker classification** — 26 CFR § 31.3121(d)-1');
		expect(memo).toContain('## Open questions');
		expect(memo).toContain('Are they employees?');
		// It says what it is, so nobody hands it on as an opinion.
		expect(memo).toContain('not a tax opinion');
	});

	it('marks a done item as done in the memo', () => {
		brief.add([finding('One')]);
		expect(brief.asMarkdown()).toContain('- [ ] **One**');
		brief.toggle(brief.findings[0].id);
		expect(brief.asMarkdown()).toContain('- [x] **One**');
	});

	it('starts empty and can be emptied', () => {
		expect(brief.isEmpty).toBe(true);
		brief.add([finding('One')]);
		expect(brief.isEmpty).toBe(false);
		brief.clear();
		expect(brief.isEmpty).toBe(true);
	});
});
