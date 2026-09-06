/**
 * The tool packs, in one place.
 *
 * This list was written out three times — once where the plugins are mounted,
 * once in the settings state that decides which to ask for, and once in the
 * request parser that validates what arrived. Adding a pack meant remembering
 * all three, and forgetting the third failed in the worst possible way: the
 * pack mounted fine in every test, and the server quietly filtered it out of
 * the real request, so the model reported that a tool it could plainly see in
 * its instructions "is not available in this session".
 *
 * Deliberately free of imports, so client, server and harness can all take it
 * without dragging anything else along.
 */

export const PACK_IDS = [
	'ecfr',
	'federal-register',
	'review',
	'critic',
	'brief',
	'study'
] as const;

export type PackId = (typeof PACK_IDS)[number];

/** What each one is, for the settings panel. */
export const PACKS: Record<PackId, { name: string; detail: string }> = {
	ecfr: {
		name: 'Code of Federal Regulations',
		detail: 'Search and read the current text of the CFR.'
	},
	'federal-register': {
		name: 'Federal Register',
		detail: 'Proposed and final rules, effective dates, comment deadlines.'
	},
	review: {
		name: 'Document review',
		detail: 'Scan a loaded document for passages carrying a regulatory exposure.'
	},
	critic: {
		name: 'Second opinion',
		detail: 'A separate model call that reads the answer back before you see it.'
	},
	brief: {
		name: 'The brief',
		detail: 'Findings and open questions written down as she goes, ready to take away.'
	},
	study: {
		name: 'Teaching and examining',
		detail: 'Lessons on screen, and exam-style questions with hints and answers held back.'
	}
};
