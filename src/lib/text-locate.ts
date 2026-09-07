/**
 * Finding a quote in a page's own text layer.
 *
 * OCR gives blocks, and a block can be a whole numbered list — four separate
 * findings inside one rectangle. The PDF's text layer is finer: it knows where
 * every run of characters was drawn. Matching a quote against the concatenated
 * runs and taking the union of the runs it spans puts the mark on the sentence
 * rather than the paragraph.
 *
 * Everything here is pure and works in the OCR's coordinate space, so the
 * result can be swapped in for a block box with no other change.
 */

import type { TextRun } from '$lib/client/pdf';
import type { Box } from '$lib/ocr-match';

/** Same normalisation on both sides, with an index back to the source. */
function flatten(runs: TextRun[]): { text: string; owner: number[] } {
	let text = '';
	const owner: number[] = [];

	runs.forEach((run, index) => {
		const cleaned = run.text.replace(/\s+/g, ' ');
		for (const character of cleaned) {
			const lower = character.toLowerCase();
			// Collapse runs of whitespace across run boundaries too, or a quote
			// spanning two runs picks up a double space and stops matching.
			if (lower === ' ' && text.endsWith(' ')) continue;
			text += lower;
			owner.push(index);
		}
		if (!text.endsWith(' ')) {
			text += ' ';
			owner.push(index);
		}
	});

	return { text, owner };
}

function simplify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The same text with everything but letters, digits and spaces removed.
 *
 * A quote has to survive the round trip through a model to be found again, and
 * punctuation is what it loses: a hyphen becomes an en dash, an apostrophe
 * straightens, a comma is dropped. Matching on letters alone finds the passage
 * anyway. Punctuation becomes a space rather than nothing, so a hyphenated word
 * reads as two — the index map is kept in step so the box is still the union of
 * the runs the words actually landed in.
 */
function lettersOnly(text: string, owner: number[]): { text: string; owner: number[] } {
	let out = '';
	const map: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (/[a-z0-9]/.test(character)) {
			out += character;
			map.push(owner[index]);
			continue;
		}
		// A space, not nothing. Deleting the hyphen out of "shop-floor" welds it
		// into "shopfloor", which then matches neither the page nor the quote.
		if (!out.endsWith(' ') && out.length) {
			out += ' ';
			map.push(owner[index]);
		}
	}
	// A trailing space would leave a dangling index; trim both together.
	while (out.endsWith(' ')) {
		out = out.slice(0, -1);
		map.pop();
	}
	return { text: out, owner: map };
}

/** The needle put through the same sieve, where no index map is wanted. */
function lettersOf(text: string): string {
	return lettersOnly(text, []).text;
}

/** The union of the runs a quote spans, or null when it is not on this page. */
export function locateInRuns(quote: string, runs: TextRun[]): Box | null {
	if (!runs.length) return null;

	const needle = simplify(quote);
	if (needle.length < 8) return null;

	const { text, owner } = flatten(runs);

	let start = text.indexOf(needle);
	let span = needle.length;
	let index = owner;

	if (start === -1) {
		// Punctuation is what a quote loses on the way through a model. Try
		// again on letters alone before giving up and handing this to the
		// block-level estimate, which puts the mark near the passage rather
		// than on it.
		const loose = lettersOnly(text, owner);
		const target = lettersOf(needle);
		const at = target ? loose.text.indexOf(target) : -1;
		if (at === -1) return null;
		start = at;
		span = target.length;
		index = loose.owner;
	}

	const first = index[start];
	const last = index[Math.min(start + span - 1, index.length - 1)];
	if (first === undefined || last === undefined) return null;

	const spanned = runs.slice(first, last + 1);
	if (!spanned.length) return null;

	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;

	for (const run of spanned) {
		left = Math.min(left, run.x);
		top = Math.min(top, run.y);
		right = Math.max(right, run.x + run.width);
		bottom = Math.max(bottom, run.y + run.height);
	}

	// A little air so the mark frames the text rather than clipping it.
	const pad = Math.max(1, (bottom - top) * 0.16);
	return {
		x: left - pad,
		y: top - pad,
		width: right - left + pad * 2,
		height: bottom - top + pad * 2
	};
}
