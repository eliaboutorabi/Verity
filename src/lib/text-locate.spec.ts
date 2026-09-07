import { describe, expect, it } from 'vitest';
import { locateInRuns } from './text-locate.js';
import type { TextRun } from './client/pdf.js';
import { inReadingOrder } from './client/pdf.js';

/** Four list items, each wrapping onto two lines, as pdf.js reports them. */
const runs: TextRun[] = [
	{ text: '1. We will treat the four shop-floor staff as independent', x: 60, y: 100, width: 380, height: 12 },
	{ text: 'contractors on a 1099 basis for the rest of the year.', x: 78, y: 116, width: 340, height: 12 },
	{ text: '2. The owner will take a minimal salary and the rest in', x: 60, y: 148, width: 370, height: 12 },
	{ text: 'distributions.', x: 78, y: 164, width: 90, height: 12 },
	{ text: '3. Client dinners at the trade show are fully deductible;', x: 60, y: 196, width: 375, height: 12 },
	{ text: 'no receipts were retained.', x: 78, y: 212, width: 170, height: 12 },
	{ text: '4. This treatment is guaranteed to survive audit.', x: 60, y: 244, width: 330, height: 12 }
];

describe('locateInRuns', () => {
	it('lands on the line a short quote sits in', () => {
		const box = locateInRuns('This treatment is guaranteed to survive audit', runs)!;
		expect(box).not.toBeNull();
		expect(box.y).toBeGreaterThan(240);
		expect(box.y).toBeLessThan(250);
	});

	it('spans both lines of a wrapped sentence', () => {
		const box = locateInRuns(
			'The owner will take a minimal salary and the rest in distributions.',
			runs
		)!;
		expect(box.y).toBeLessThan(150);
		expect(box.y + box.height).toBeGreaterThan(174);
	});

	it('keeps four items apart rather than covering the block', () => {
		const boxes = [
			'We will treat the four shop-floor staff',
			'The owner will take a minimal salary',
			'Client dinners at the trade show are fully deductible',
			'This treatment is guaranteed to survive audit'
		].map((quote) => locateInRuns(quote, runs)!);

		expect(boxes.every(Boolean)).toBe(true);
		for (let i = 1; i < boxes.length; i += 1) {
			expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
			// No overlap: each mark is its own item.
			expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].height - 4);
		}
	});

	it('matches across a line break, where the raw text has none', () => {
		expect(locateInRuns('as independent contractors on a 1099 basis', runs)).not.toBeNull();
	});

	it('is unfazed by curly quotes and extra spacing', () => {
		expect(locateInRuns('  Client   dinners at the trade show  ', runs)).not.toBeNull();
	});

	it('returns null for text that is not on the page', () => {
		expect(locateInRuns('depreciation of qualified improvement property', runs)).toBeNull();
	});

	it('returns null for a page with no text layer', () => {
		expect(locateInRuns('anything at all here', [])).toBeNull();
	});

	it('ignores a quote too short to identify anything', () => {
		expect(locateInRuns('the', runs)).toBeNull();
	});
});

describe('a quote whose punctuation drifted', () => {
	it('finds the passage anyway', () => {
		// A quote makes a round trip through a model before it comes back to be
		// marked, and punctuation is what it loses: a hyphen becomes an en dash,
		// an apostrophe straightens, a comma goes missing. Without this the mark
		// fell back to a block-level estimate and clipped the passage in half.
		const box = locateInRuns('shop floor staff as independent contractors', runs);
		expect(box).not.toBeNull();
		expect(box!.y).toBeLessThan(105);
	});

	it('still covers both lines when it matches loosely', () => {
		const box = locateInRuns('owner will take a minimal salary — and the rest in distributions', runs)!;
		expect(box).not.toBeNull();
		expect(box.y).toBeLessThan(150);
		expect(box.y + box.height).toBeGreaterThan(174);
	});

	it('refuses a passage that is not on the page, however it is punctuated', () => {
		expect(locateInRuns('a paragraph from some other document entirely', runs)).toBeNull();
	});
});

describe('runs that arrive out of reading order', () => {
	/**
	 * pdf.js emits runs in content-stream order, not reading order — this page's
	 * headings come out before the body they head, and the footer last. A
	 * contiguous *text* match then maps to a contiguous *index* range that is
	 * scattered down the page, and the union of it was a box 85% of the page
	 * tall, shading everything and pointing at nothing.
	 */
	const scrambled: TextRun[] = [
		{ text: '4. TERM AND TERMINATION', x: 60, y: 400, width: 200, height: 12 },
		{ text: 'Approved travel expenses shall be reimbursed', x: 60, y: 100, width: 300, height: 12 },
		{ text: 'at the standard mileage rate.', x: 60, y: 116, width: 200, height: 12 },
		{ text: 'SPECIMEN — for demonstration', x: 60, y: 760, width: 220, height: 8 }
	];

	it('is a hazard the locator cannot see, so the source must order them', () => {
		const box = locateInRuns('travel expenses shall be reimbursed at the standard mileage rate', scrambled);
		// Runs 1 and 2 are adjacent in the array here, so this one is fine —
		// what breaks is a match whose range straddles a run that belongs
		// somewhere else entirely.
		expect(box!.height).toBeLessThan(60);
	});

	it('spans the page when an unrelated run sits between the matching ones', () => {
		const straddled: TextRun[] = [
			{ text: 'Approved travel expenses shall be', x: 60, y: 100, width: 300, height: 12 },
			{ text: 'SPECIMEN — for demonstration', x: 60, y: 760, width: 220, height: 8 },
			{ text: 'reimbursed at the standard rate.', x: 60, y: 116, width: 200, height: 12 }
		];
		const box = locateInRuns('travel expenses shall be SPECIMEN', straddled);
		// This is the failure, stated: 600-odd points of page covered by a mark
		// meant for two lines. inReadingOrder in pdf.ts is what prevents it.
		expect(box!.height).toBeGreaterThan(600);
	});
});

describe('inReadingOrder', () => {
	it('puts a page back down-then-across', () => {
		const scrambled: TextRun[] = [
			{ text: 'heading', x: 60, y: 400, width: 200, height: 12 },
			{ text: 'second half of line', x: 260, y: 100, width: 120, height: 12 },
			{ text: 'first half of line', x: 60, y: 100.4, width: 190, height: 12 },
			{ text: 'footer', x: 60, y: 760, width: 220, height: 8 }
		];

		expect(inReadingOrder(scrambled).map((run) => run.text)).toEqual([
			// The two halves share a line despite differing baselines, so they are
			// ordered by x rather than shuffled by a fraction of a point.
			'first half of line',
			'second half of line',
			'heading',
			'footer'
		]);
	});
});
