/**
 * The general accounting interview.
 *
 * The exam pack asks about regulations, and every question it asks she has to
 * write herself out of something she just read. This is the other kind of
 * practice: 192 technical accounting interview questions with model answers,
 * talking points and a note on what an interviewer is listening for, across
 * four levels from the accounting equation to standard costing.
 *
 * They are drawn rather than written, which changes what she is for. She does
 * not invent the question, so she cannot accidentally ask something she is
 * confident about and wrong on; her job is to put it, listen, and mark it
 * against an answer somebody else wrote down. The bank's own "what the
 * interviewer is looking for" note goes to her and never to the screen, so she
 * marks against the same thing a real interviewer would.
 *
 * Nothing here touches the CFR, which is why it is a separate pack and off
 * until someone asks for it.
 */

import { defineTool, type Context, type ToolRegistry } from '$lib/harness';
import bank from './interview-bank.json';

interface BankQuestion {
	slug: string;
	level: number;
	topic: string;
	difficulty: number;
	question: string;
	answer: string;
	hints: string[];
	looksFor: string;
}

const QUESTIONS = bank.questions as BankQuestion[];
const LEVELS = bank.levels as Record<string, string>;
export const INTERVIEW_TOPICS = bank.topics as string[];

/** Level names, for the tool's own enum. */
const LEVEL_NAMES = ['Foundational', 'Intermediate', 'Advanced', 'Cost and managerial'] as const;

let counter = 0;

/**
 * Pick one, avoiding what has already been asked this session.
 *
 * An interview that comes back to the same question is not an interview, and
 * the model cannot be relied on to remember which slugs it has drawn — the
 * voice path in particular hands each call to a fresh context.
 */
function draw(
	asked: Set<string>,
	filters: { level?: number; topic?: string }
): BankQuestion | undefined {
	const matches = QUESTIONS.filter(
		(question) =>
			(filters.level === undefined || question.level === filters.level) &&
			(filters.topic === undefined || question.topic === filters.topic)
	);
	const pool = matches.filter((question) => !asked.has(question.slug));
	// Every question in the requested corner has been used; rather than refuse,
	// widen back to the whole bank, and only then start repeating.
	const source = pool.length ? pool : matches.length ? matches : QUESTIONS;
	return source[Math.floor(Math.random() * source.length)];
}

export function interviewPlugin(asked: Iterable<string> = []) {
	return {
		name: 'interview',
		inject: ['tools'] as const,

		apply(ctx: Context) {
			const seen = new Set(asked);
			const tools = ctx.require<ToolRegistry>('tools');

			tools.register(
				defineTool({
					name: 'draw_interview_question',
					label: 'Asking a question',
					description: [
						'THE ONLY WAY TO ASK A GENERAL ACCOUNTING INTERVIEW QUESTION. Draws one from a bank of 192 technical questions with model answers — debits and credits, the close, revenue recognition, deferred tax, leases, costing, variances.',
						'Use it for accounting practice that is not about the regulations. For a question about what the CFR requires, use ask_question and write it yourself from something you have read.',
						'You do not write this question and you do not write its answer. Put it as it comes, listen, and mark the attempt against the answer the bank gives you.',
						'Only one question may be open at a time. Never draw a new one while a question you have already asked is unmarked — mark that one with score_answer first, or the mark lands on the wrong question.',
						'Ask one, then stop and wait.'
					].join(' '),
					parameters: {
						level: {
							type: 'string',
							enum: LEVEL_NAMES,
							description:
								'How hard. Foundational is entry level, Advanced is controller-track. Leave it out to let the bank choose.'
						},
						topic: {
							type: 'string',
							description:
								'A topic slug to stay within, such as "bank-reconciliation" or "deferred-taxes". Leave it out for anything.'
						}
					},
					output: {
						schema: {
							type: 'object',
							additionalProperties: false,
							properties: {
								id: { type: 'string', required: true },
								area: { type: 'string', required: true },
								topic: { type: 'string', required: true },
								skill: {
									type: 'string',
									enum: ['recall', 'application', 'analysis'] as const,
									required: true
								},
								prompt: { type: 'string', required: true },
								hints: { type: 'array', required: true, items: { type: 'string' } },
								answer: { type: 'string', required: true },
								slug: { type: 'string', required: true },
								/** Never shown; it is how she marks. */
								looksFor: { type: 'string', required: true }
							}
						},
						render: (_args, value) => [
							{
								type: 'text',
								text: [
									`Question ${value.id} is on screen: ${value.topic}.`,
									'Put it to them and then wait. Do not hint and do not answer it.',
									value.looksFor
										? `When they answer, mark it against this — the interviewer is listening for: ${value.looksFor}`
										: 'When they answer, mark it with score_answer.',
									'This note is for you and is not on the screen.'
								].join(' ')
							}
						],
						speak: (_args, value) => [
							{
								type: 'text',
								text: [
									`Question ${value.id} is on screen. Read it aloud, then stop and let them think.`,
									value.looksFor ? `You are listening for: ${value.looksFor}` : ''
								].join(' ')
							}
						]
					},
					presentResult: (_args, value) => ({
						card: 'question',
						title: value.topic,
						question: {
							id: value.id,
							area: value.area,
							topic: value.topic,
							skill: value.skill,
							prompt: value.prompt,
							hints: value.hints,
							answer: value.answer,
							slug: value.slug
						}
					}),
					execute: (args) => {
						const level = args.level ? LEVEL_NAMES.indexOf(args.level) + 1 : undefined;
						const picked = draw(seen, { level, topic: args.topic });
						if (!picked) throw new Error('The interview bank came back empty.');
						seen.add(picked.slug);

						return {
							id: `i${(counter += 1)}`,
							slug: picked.slug,
							area: LEVELS[String(picked.level)] ?? 'Accounting',
							// Slugs are for the tool; a person reads "bank reconciliation".
							topic: picked.topic.replace(/-/g, ' '),
							// The bank's 1–4 difficulty, read across to the three levels the
							// question card already knows how to label.
							skill:
								picked.difficulty <= 1
									? ('recall' as const)
									: picked.difficulty === 2
										? ('application' as const)
										: ('analysis' as const),
							prompt: picked.question,
							hints: picked.hints,
							answer: picked.answer,
							looksFor: picked.looksFor
						};
					}
				})
			);
		}
	};
}
