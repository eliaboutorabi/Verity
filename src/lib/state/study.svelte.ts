/**
 * The exam, as the browser sees it.
 *
 * She writes a question, its hints and its answer in one go and hands all three
 * over. What is on screen is decided here, not there — which is the point.
 * Nothing she says has to contain the answer, so nothing she says can leak it;
 * a hint appears the instant it is asked for, with no round trip; and the
 * question stays up while the candidate sits and thinks, which is the part of
 * an exam that a chat transcript is worst at.
 *
 * The run is kept too. Four questions with two right and three hints spent is a
 * more useful thing to look at than four questions scrolled past.
 */

import type { ExamQuestion } from '$lib/harness';

export interface AskedQuestion extends ExamQuestion {
	/** How many hints have been let out, in order. */
	hintsShown: number;
	answerShown: boolean;
	verdict?: 'correct' | 'partly' | 'incorrect';
	feedback?: string;
	askedAt: number;
}

class StudyState {
	asked = $state<AskedQuestion[]>([]);

	/** The one she is waiting on, if any. */
	readonly current = $derived(this.asked.at(-1));
	readonly isEmpty = $derived(this.asked.length === 0);

	/** Only marked questions count; the open one is not a miss yet. */
	readonly marked = $derived(this.asked.filter((question) => question.verdict !== undefined));
	readonly correct = $derived(this.marked.filter((q) => q.verdict === 'correct').length);
	readonly partly = $derived(this.marked.filter((q) => q.verdict === 'partly').length);
	readonly hintsUsed = $derived(
		this.asked.reduce((total, question) => total + question.hintsShown, 0)
	);

	/** Put a new question up. */
	ask(question: ExamQuestion): void {
		if (this.asked.some((existing) => existing.id === question.id)) return;
		this.asked.push({ ...question, hintsShown: 0, answerShown: false, askedAt: Date.now() });
	}

	byId(id: string): AskedQuestion | undefined {
		return this.asked.find((question) => question.id === id);
	}

	/**
	 * Let out one more hint. Returns the hint, or null when there are none left.
	 *
	 * Defaults to the open question, because that is the only one anybody means:
	 * a reveal arriving from the model carries no id, and a reveal arriving from
	 * the card carries its own.
	 */
	revealHint(id = this.current?.id): string | null {
		const question = id ? this.byId(id) : undefined;
		if (!question || question.hintsShown >= question.hints.length) return null;
		question.hintsShown += 1;
		return question.hints[question.hintsShown - 1];
	}

	revealAnswer(id = this.current?.id): string | null {
		const question = id ? this.byId(id) : undefined;
		if (!question) return null;
		question.answerShown = true;
		return question.answer;
	}

	/** Mark it, and show the answer with the verdict — a mark without one teaches nothing. */
	score(verdict: 'correct' | 'partly' | 'incorrect', feedback: string, id = this.current?.id): void {
		const question = id ? this.byId(id) : undefined;
		if (!question) return;
		question.verdict = verdict;
		question.feedback = feedback;
		question.answerShown = true;
	}

	clear(): void {
		this.asked = [];
	}
}

export const study = new StudyState();
