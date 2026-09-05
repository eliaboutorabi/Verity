/**
 * The brief she builds while she talks.
 *
 * An answer scrolls away. A conversation that ends with five lookups and a
 * paragraph leaves an accountant with nothing to act on and nothing to hand to
 * a client — they have to read the whole thread back and write the memo
 * themselves, which is the work they came here to avoid.
 *
 * So she writes it down as she goes. Each finding is a thing that needs doing
 * or watching, with the citation that supports it; each gap is something she
 * could not settle, named rather than glossed. The panel is the deliverable,
 * and the conversation is how it got made.
 *
 * The tools only decide *what* is written. Where it lands is the browser's
 * business, exactly as with the page marks.
 */

import { defineTool, type Context, type ToolRegistry } from '$lib/harness';

const SEVERITIES = ['high', 'medium', 'low', 'info'] as const;

export const briefPlugin = {
	name: 'brief',
	inject: ['tools'] as const,

	apply(ctx: Context) {
		const tools = ctx.require<ToolRegistry>('tools');

		tools.register(
			defineTool({
				name: 'pin_finding',
				label: 'Adding to the brief',
				description: [
					'Write something into the brief the user takes away: a point that needs acting on, watching, or documenting.',
					'Pin as you go rather than at the end — one call can carry several findings.',
					'Only pin what survives your own lookups. A finding with a citation you did not read is worse than no finding, because it will be acted on.',
					'Keep each one to a sentence a partner could read in a meeting.'
				].join(' '),
				parameters: {
					findings: {
						type: 'array',
						required: true,
						description: 'What to write down, most important first.',
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								topic: {
									type: 'string',
									required: true,
									description: 'A few words naming the issue — "Worker classification".'
								},
								detail: {
									type: 'string',
									required: true,
									description: 'One sentence: what has to be true, or what to do about it.'
								},
								citation: {
									type: 'string',
									description: 'The provision it rests on, if one does — "26 CFR § 1.162-7".'
								},
								severity: {
									type: 'string',
									enum: SEVERITIES,
									description: 'How much it matters. Defaults to info.'
								}
							}
						}
					}
				},
				output: {
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: {
							entries: {
								type: 'array',
								required: true,
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
										kind: { type: 'string', enum: ['finding', 'gap'] as const, required: true },
										topic: { type: 'string', required: true },
										detail: { type: 'string', required: true },
										citation: { type: 'string' },
										severity: { type: 'string', enum: SEVERITIES, required: true }
									}
								}
							}
						}
					},
					render: (_args, value) => [
						{
							type: 'text',
							text: [
								`Added ${value.entries.length} to the brief. The user can see them:`,
								...value.entries.map(
									(entry) =>
										`• [${entry.severity}] ${entry.topic} — ${entry.detail}${entry.citation ? ` (${entry.citation})` : ''}`
								),
								'Do not read the brief back to them; it is already on screen. Carry on with the answer.'
							].join('\n')
						}
					],
					speak: (_args, value) => [
						{
							type: 'text',
							text: `${value.entries.length} added to the brief on screen. Do not read them out; mention that you have noted them and carry on.`
						}
					]
				},
				presentResult: (_args, value) => ({
					card: 'brief',
					title: 'Added to the brief',
					entries: value.entries
				}),
				execute: (args) => ({
					entries: args.findings
						.map((finding) => ({
							kind: 'finding' as const,
							topic: finding.topic.trim().slice(0, 90),
							detail: finding.detail.trim().slice(0, 400),
							citation: finding.citation?.trim() || undefined,
							severity: finding.severity ?? ('info' as const)
						}))
						.filter((entry) => entry.topic && entry.detail)
				})
			})
		);

		tools.register(
			defineTool({
				name: 'note_gap',
				label: 'Noting what is unsettled',
				description: [
					'Record something you could not settle: a question the sources do not answer, a lookup that failed, a point that needs a person.',
					'This is how the brief stays honest. A gap named is worth more than a paragraph of hedging, and it is the thing the reader has to follow up.'
				].join(' '),
				parameters: {
					question: {
						type: 'string',
						required: true,
						description: 'What remains open, as a question.'
					},
					why: {
						type: 'string',
						required: true,
						description: 'One sentence on why you could not settle it, and what would.'
					}
				},
				output: {
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: {
							entries: {
								type: 'array',
								required: true,
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
										kind: { type: 'string', enum: ['finding', 'gap'] as const, required: true },
										topic: { type: 'string', required: true },
										detail: { type: 'string', required: true },
										severity: { type: 'string', enum: SEVERITIES, required: true }
									}
								}
							}
						}
					},
					render: (_args, value) => [
						{
							type: 'text',
							text: `Noted as open: ${value.entries[0]?.topic}. It is on screen; say in one clause that it is unresolved and move on.`
						}
					]
				},
				presentResult: (_args, value) => ({
					card: 'brief',
					title: 'Noted as open',
					entries: value.entries
				}),
				execute: (args) => ({
					entries: [
						{
							kind: 'gap' as const,
							topic: args.question.trim().slice(0, 140),
							detail: args.why.trim().slice(0, 400),
							severity: 'info' as const
						}
					]
				})
			})
		);
	}
};
