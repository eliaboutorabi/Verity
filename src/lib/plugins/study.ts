/**
 * Teaching, and being examined.
 *
 * The rest of the app answers questions. This is the other half of what an
 * accountant actually needs from the regulations: someone who will explain the
 * rule properly, and someone who will sit opposite them and ask.
 *
 * Two shapes, one pack.
 *
 * **Teaching** puts a structured explanation on screen — what the rule is, what
 * turns on it, what candidates get wrong — so the substance survives the
 * conversation scrolling away. A lecture read aloud is gone the moment it ends;
 * a lesson on the page can be re-read.
 *
 * **Examining** is a question with its hints and its answer withheld. The trick
 * is where they are withheld: the model writes all three at once, hands them to
 * the browser, and the browser decides what is visible. So there is nothing for
 * her to leak, revealing a hint costs a click rather than a round trip, and the
 * candidate can sit and think in silence with the question still on screen —
 * which is what sitting an exam is.
 *
 * Nothing here invents a syllabus. The questions come out of the same CFR she
 * reads for everything else, and the areas and skill levels are the exam's own,
 * so a wrong answer can be argued about against a citation.
 */

import { defineTool, type Context, type ToolRegistry } from '$lib/harness';

/**
 * The five areas the exam's regulation section is built from, named short.
 *
 * The blueprint's own wording runs to eight words apiece, and five of those in
 * an enum is a paragraph of schema for a field nobody reads — the long form
 * belongs in the study guide, not in every request.
 */
export const EXAM_AREAS = [
	'Ethics and procedures',
	'Business law',
	'Property transactions',
	'Individuals',
	'Entities'
] as const;

const SKILLS = ['recall', 'application', 'analysis'] as const;
const VERDICTS = ['correct', 'partly', 'incorrect'] as const;

let counter = 0;

/** Questions are identified across a session; the id is what a reveal targets. */
function nextQuestionId(): string {
	counter += 1;
	return `q${counter}`;
}

/**
 * One question open at a time, enforced rather than requested.
 *
 * Asked politely in three places — the prompt, both tool descriptions, and the
 * result text of the marking tool — she still, reliably, drew a second question
 * in the same turn as the answer to the first. And the failure is not cosmetic:
 * the mark lands on whichever question is newest, so the candidate's answer to
 * the first gets graded against the second, and the feedback discusses a
 * question nobody was asked.
 *
 * A rule that can be enforced should not be a request. This is a plain
 * pre-execute guard: while a question is unmarked, asking another is refused
 * with the reason and the way out.
 *
 * It has to know about `draw_interview_question`, which belongs to another
 * pack, because both put a question on the same screen and there is only one
 * screen. Naming it here is the smaller wrong than letting either pack overrun
 * the other.
 */
const ASKING = new Set(['ask_question', 'draw_interview_question']);

export function openQuestionGuard(openAtStart = false) {
	return {
		name: 'open-question-guard',
		inject: ['tools'] as const,

		apply(ctx: Context) {
			// Seeded by the browser, which is the only thing that knows a question
			// from a previous turn is still sitting there unanswered.
			let open = openAtStart;

			return ctx.on('tools/pre-execute', ({ name }: { name: string }) => {
				if (name === 'score_answer') {
					open = false;
					return undefined;
				}
				if (!ASKING.has(name)) return undefined;
				if (!open) {
					open = true;
					return undefined;
				}
				return {
					deny: 'there is already a question on screen that you have not marked. Call score_answer on it first, so the mark lands on the question they actually answered. If they are skipping it, mark it incorrect and say so before you ask another.'
				};
			});
		}
	};
}

export const studyPlugin = {
	name: 'study',
	inject: ['tools'] as const,

	apply(ctx: Context) {
		const tools = ctx.require<ToolRegistry>('tools');

		tools.register(
			defineTool({
				name: 'teach_concept',
				label: 'Teaching',
				description: [
					'THE WAY TO EXPLAIN A RULE TO SOMEONE LEARNING IT. Do not write the explanation out in prose instead — on screen it can be re-read, and in a spoken answer it is gone.',
					'Put a structured explanation on the screen: what the rule is, what turns on it, and where people go wrong.',
					'Use this when someone is trying to *learn* a rule rather than apply it to a live file — studying for the exam, getting up to speed on an area, asking "how does this actually work".',
					'Look the provision up first. A lesson built from memory is the one thing worse than no lesson, because it will be revised from.',
					'Three to five points. Each one should be a thing that is true and testable, not a heading.'
				].join(' '),
				parameters: {
					topic: {
						type: 'string',
						required: true,
						description: 'What is being taught, in a few words — "Substantiating travel".'
					},
					summary: {
						type: 'string',
						required: true,
						description: 'The whole thing in one sentence, the way you would say it out loud.'
					},
					points: {
						type: 'array',
						required: true,
						description: 'The substance, in the order it makes sense to learn it.',
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								heading: {
									type: 'string',
									required: true,
									description: 'A few words naming this point.'
								},
								detail: {
									type: 'string',
									required: true,
									description: 'One or two sentences. State the rule, not the topic.'
								},
								citation: {
									type: 'string',
									description: 'The provision this point rests on, if one does.'
								}
							}
						}
					},
					pitfall: {
						type: 'string',
						description: 'The mistake people actually make here, in one sentence.'
					}
				},
				output: {
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: {
							topic: { type: 'string', required: true },
							summary: { type: 'string', required: true },
							points: {
								type: 'array',
								required: true,
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
										heading: { type: 'string', required: true },
										detail: { type: 'string', required: true },
										citation: { type: 'string' }
									}
								}
							},
							pitfall: { type: 'string' }
						}
					},
					render: (_args, value) => [
						{
							type: 'text',
							text: [
								`The lesson on "${value.topic}" is on screen: ${value.points.length} points${value.pitfall ? ' and the pitfall' : ''}.`,
								'Say the summary in your own words and offer to take any point further. Do not read the points back — they are already there.'
							].join(' ')
						}
					],
					speak: (_args, value) => [
						{
							type: 'text',
							text: `"${value.topic}" is on screen. Say the one-sentence summary, then ask which part they want to go into. Do not read the points aloud.`
						}
					]
				},
				presentCall: (args) => ({ card: 'teaching', title: 'Teaching', topic: args.topic }),
				presentResult: (_args, value) => ({
					card: 'lesson',
					title: value.topic,
					topic: value.topic,
					summary: value.summary,
					points: value.points,
					pitfall: value.pitfall
				}),
				execute: (args) => ({
					topic: args.topic.trim().slice(0, 90),
					summary: args.summary.trim().slice(0, 300),
					points: args.points.slice(0, 6).map((point) => ({
						// The card numbers them itself, and a model that also numbers
						// its headings gives you "1  1. The four elements".
						heading: point.heading.trim().replace(/^\d+[.)]\s*/, '').slice(0, 80),
						detail: point.detail.trim().slice(0, 400),
						citation: point.citation?.trim() || undefined
					})),
					pitfall: args.pitfall?.trim().slice(0, 300) || undefined
				})
			})
		);

		tools.register(
			defineTool({
				name: 'ask_question',
				label: 'Asking a question',
				description: [
					'THE ONLY WAY TO ASK THE USER A TEST QUESTION. Quiz, test, drill, interview, "ask me one", "another" — all of them come here.',
					'Never type an exam question into your reply instead. A question in prose has no hints held ready, no answer to reveal and nothing to mark, so it is not the exercise they asked for.',
					'Put one exam-style question on the screen and wait for an answer.',
					'You write the hints and the answer here, at the same time as the question. They are held back by the screen and are not shown until the user asks for them, so writing them now costs nothing and means a hint is ready the moment it is wanted.',
					'Ground the question in a provision you have actually read. A question whose answer you cannot cite is a question you cannot mark.',
					'Only one question may be open at a time. Never ask a new one while a question you have already asked is unmarked — mark that one with score_answer first, or the mark lands on the wrong question.',
					'Ask one. Then stop and wait — do not follow it with a second question, a hint, or the answer.'
				].join(' '),
				parameters: {
					area: {
						type: 'string',
						required: true,
						enum: EXAM_AREAS,
						description: 'Which of the exam areas this sits in.'
					},
					topic: {
						type: 'string',
						required: true,
						description: 'The specific thing being tested — "Passive activity losses".'
					},
					skill: {
						type: 'string',
						required: true,
						enum: SKILLS,
						description:
							'recall is "what does the rule say", application is "apply it to these facts", analysis is "which treatment is right and why".'
					},
					question: {
						type: 'string',
						required: true,
						description:
							'The question itself. For anything above recall, give the facts first and then ask.'
					},
					choices: {
						type: 'array',
						description:
							'Four options for a multiple-choice question. Leave this out for an open question.',
						items: {
							type: 'object',
							additionalProperties: false,
							properties: {
								label: { type: 'string', required: true, description: 'A, B, C or D.' },
								text: { type: 'string', required: true, description: 'The option.' }
							}
						}
					},
					hints: {
						type: 'array',
						required: true,
						description:
							'One to three hints, each a real step toward the answer rather than a restatement. Order them from the gentlest nudge to the one that all but gives it away.',
						items: { type: 'string' }
					},
					answer: {
						type: 'string',
						required: true,
						description:
							'The answer, and why. For multiple choice, name the letter and say what is wrong with the tempting one.'
					},
					citation: {
						type: 'string',
						description: 'The provision the answer rests on — "26 CFR § 1.469-5T".'
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
							skill: { type: 'string', enum: SKILLS, required: true },
							prompt: { type: 'string', required: true },
							choices: {
								type: 'array',
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
										label: { type: 'string', required: true },
										text: { type: 'string', required: true }
									}
								}
							},
							hints: { type: 'array', required: true, items: { type: 'string' } },
							answer: { type: 'string', required: true },
							citation: { type: 'string' }
						}
					},
					render: (_args, value) => [
						{
							type: 'text',
							text: [
								`Question ${value.id} is on screen, with ${value.hints.length} hint${value.hints.length === 1 ? '' : 's'} and the answer held back.`,
								'Read the question once and then wait. Do not state a hint or the answer in what you say — call reveal when they ask.',
								'When they answer, call score_answer.'
							].join(' ')
						}
					],
					speak: (_args, value) => [
						{
							type: 'text',
							text: [
								`Question ${value.id} is on screen.`,
								value.choices?.length
									? 'Read the question and the options aloud, then stop.'
									: 'Read the question aloud, then stop.',
								'Do not hint and do not answer it. Wait for them.'
							].join(' ')
						}
					]
				},
				presentResult: (_args, value) => ({
					card: 'question',
					title: value.topic,
					question: value
				}),
				execute: (args) => ({
					id: nextQuestionId(),
					area: args.area,
					topic: args.topic.trim().slice(0, 90),
					skill: args.skill,
					prompt: args.question.trim().slice(0, 1200),
					choices: args.choices?.slice(0, 6).map((choice) => ({
						label: choice.label.trim().slice(0, 4),
						text: choice.text.trim().slice(0, 300)
					})),
					hints: args.hints
						.slice(0, 3)
						.map((hint) => hint.trim().slice(0, 300))
						.filter(Boolean),
					answer: args.answer.trim().slice(0, 900),
					citation: args.citation?.trim() || undefined
				})
			})
		);

		tools.register(
			defineTool({
				name: 'reveal',
				label: 'Revealing',
				description: [
					'Show the next hint, or the answer, for the question already on screen.',
					'The text is the one you wrote with the question; you do not pass it again. Say it in your own words once it is up.',
					'Give a hint when they ask for one or have visibly stalled. Give the answer when they ask for it, or when they have had a proper go and got it wrong — not before, and never to move things along.'
				].join(' '),
				parameters: {
					what: {
						type: 'string',
						required: true,
						enum: ['hint', 'answer'] as const,
						description: 'Which to put on screen.'
					}
				},
				output: {
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: { what: { type: 'string', enum: ['hint', 'answer'] as const, required: true } }
					},
					render: (_args, value) =>
						value.what === 'hint'
							? [
									{
										type: 'text',
										text: 'The next hint is on screen. Say it, then give them room — do not follow it with the answer.'
									}
								]
							: [
									{
										type: 'text',
										text: 'The answer is on screen. Talk them through why it is the answer, then ask whether they want another question.'
									}
								]
				},
				presentResult: (_args, value) => ({
					card: 'reveal',
					title: value.what === 'hint' ? 'Hint' : 'Answer',
					what: value.what
				}),
				execute: (args) => ({ what: args.what })
			})
		);

		tools.register(
			defineTool({
				name: 'score_answer',
				label: 'Marking',
				description: [
					'Mark the attempt at the question on screen, and close it.',
					'Be a marker, not a cheerleader. "partly" is for an answer that reaches the right treatment by the wrong route, or gets the rule and misses the exception — say which.',
					'One sentence of feedback, naming the thing that decided it.'
				].join(' '),
				parameters: {
					verdict: {
						type: 'string',
						required: true,
						enum: VERDICTS,
						description: 'How the attempt did.'
					},
					feedback: {
						type: 'string',
						required: true,
						description: 'One sentence: what was right, or what the miss was.'
					}
				},
				output: {
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: {
							verdict: { type: 'string', enum: VERDICTS, required: true },
							feedback: { type: 'string', required: true }
						}
					},
					render: (_args, value) => [
						{
							type: 'text',
							text: [
								`Marked ${value.verdict}. The score is on screen.`,
								'Now say the feedback and stop.',
								'Do not ask another question in this turn — neither ask_question nor draw_interview_question. Ask whether they want another and let them say so.',
								'Someone who has just got one wrong may want to talk about it, and firing the next question at them takes that away.'
							].join(' ')
						}
					]
				},
				presentResult: (_args, value) => ({
					card: 'verdict',
					title: value.verdict === 'correct' ? 'Correct' : value.verdict === 'partly' ? 'Partly' : 'Not quite',
					verdict: value.verdict,
					feedback: value.feedback
				}),
				execute: (args) => ({
					verdict: args.verdict,
					feedback: args.feedback.trim().slice(0, 400)
				})
			})
		);
	}
};
