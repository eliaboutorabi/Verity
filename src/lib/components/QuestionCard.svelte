<script lang="ts">
	/**
	 * A question, sitting on the screen while someone thinks about it.
	 *
	 * It does not come out of the tool result the way the other cards do. The
	 * result only *starts* it; from then on the card reads the study store, so
	 * one card grows as hints are let out and the answer arrives rather than
	 * three cards appearing in a row and burying the question that started it.
	 *
	 * The buttons send an ordinary message rather than reaching into the store,
	 * so asking for a hint by clicking and asking for one out loud go down the
	 * same path and she knows about both. Nothing here decides anything: the
	 * store holds what is revealed and she holds why.
	 */
	import { HelpCircleIcon, ViewIcon } from '@hugeicons/core-free-icons';
	import Icon from './Icon.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { study } from '$lib/state/study.svelte';

	let {
		questionId,
		onsend
	}: {
		questionId: string;
		/** Ask her for something, as though it had been typed. */
		onsend?: (text: string) => void;
	} = $props();

	const question = $derived(study.byId(questionId));
	const hintsLeft = $derived(
		question ? question.hints.length - question.hintsShown : 0
	);

	/**
	 * Pick an option.
	 *
	 * Reading four options and then typing "B" is work the screen should be
	 * doing. The click records the choice locally so the card can show which one
	 * was pressed, and sends it as a message like any other answer — so the same
	 * marking happens whether it was clicked or spoken.
	 */
	function answer(choice: { label: string; text: string }) {
		if (!onsend || !question || question.verdict !== undefined) return;
		study.choose(choice.label, question.id);
		onsend(`${choice.label} — ${choice.text}`);
	}

	const SKILL_LABEL: Record<string, string> = {
		recall: 'Recall',
		application: 'Application',
		analysis: 'Analysis'
	};

	const VERDICT_LABEL: Record<string, string> = {
		correct: 'Correct',
		partly: 'Partly right',
		incorrect: 'Not quite'
	};
</script>

{#if question}
	<article class="question" data-verdict={question.verdict ?? 'open'}>
		<header>
			<span class="eyebrow">{question.topic}</span>
			<span class="skill">{SKILL_LABEL[question.skill] ?? question.skill}</span>
		</header>

		<p class="prompt">{question.prompt}</p>

		{#if question.choices?.length}
			<ol class="choices">
				{#each question.choices as choice (choice.label)}
					<li>
						<button
							type="button"
							class:picked={question.chosen === choice.label}
							disabled={!onsend || question.verdict !== undefined}
							onclick={() => answer(choice)}
						>
							<span class="letter">{choice.label}</span>
							<span>{choice.text}</span>
						</button>
					</li>
				{/each}
			</ol>
		{/if}

		{#if question.hintsShown > 0}
			<ul class="hints">
				{#each question.hints.slice(0, question.hintsShown) as hint, index (index)}
					<li>
						<span class="hint-label">Hint {index + 1}</span>
						{hint}
					</li>
				{/each}
			</ul>
		{/if}

		{#if question.answerShown}
			<div class="answer">
				<span class="answer-label">Answer</span>
				<div class="prose">{@html renderMarkdown(question.answer)}</div>
				{#if question.citation}<span class="cite">{question.citation}</span>{/if}
			</div>
		{/if}

		{#if question.verdict}
			<p class="verdict">
				<strong>{VERDICT_LABEL[question.verdict]}</strong>
				{question.feedback}
			</p>
		{/if}

		{#if !question.answerShown && onsend}
			<footer>
				{#if hintsLeft > 0}
					<button type="button" onclick={() => onsend('Give me a hint.')}>
						<Icon icon={HelpCircleIcon} size={15} />
						Hint
						<span class="left">{hintsLeft}</span>
					</button>
				{/if}
				<button
					type="button"
					class="ghost"
					onclick={() => onsend('I do not know — show me the answer.')}
				>
					<Icon icon={ViewIcon} size={15} />
					Show the answer
				</button>
			</footer>
		{/if}

		{#if study.marked.length > 0}
			<p class="run">
				{study.correct} of {study.marked.length} so far{study.hintsUsed
					? ` · ${study.hintsUsed} hint${study.hintsUsed === 1 ? '' : 's'} used`
					: ''}
			</p>
		{/if}
	</article>
{/if}

<style>
	.question {
		display: grid;
		gap: 12px;
		padding: 18px 20px 16px;
		border-radius: var(--radius-md);
		background: var(--surface);
		border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent);
	}

	.question[data-verdict='correct'] {
		border-color: color-mix(in srgb, var(--severity-low) 46%, transparent);
	}

	.question[data-verdict='incorrect'] {
		border-color: color-mix(in srgb, var(--severity-high) 46%, transparent);
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.eyebrow,
	.skill,
	.hint-label,
	.answer-label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.eyebrow {
		color: var(--accent);
	}

	.skill {
		color: var(--muted);
	}

	/* Bigger than body text: this is the thing on the screen, not a note about it. */
	.prompt {
		margin: 0;
		font-size: clamp(15.5px, 1.15vw, 17.5px);
		line-height: 1.5;
		color: var(--ink);
	}

	.choices {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 7px;
	}

	.choices button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
		width: 100%;
		text-align: left;
		padding: 9px 12px;
		border: 1px solid var(--line);
		border-radius: 11px;
		background: none;
		font: inherit;
		font-size: 14.5px;
		line-height: 1.45;
		color: var(--ink-soft);
		cursor: pointer;
		transition:
			border-color 160ms var(--ease),
			background 160ms var(--ease),
			color 160ms var(--ease);
	}

	.choices button:hover:not(:disabled) {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
		background: var(--accent-soft);
		color: var(--ink);
	}

	.choices button:disabled {
		cursor: default;
	}

	/* Which one they pressed, still legible once it has been marked. */
	.choices button.picked {
		border-color: color-mix(in srgb, var(--accent) 55%, transparent);
		background: var(--accent-soft);
		color: var(--ink);
	}

	.letter {
		font-family: var(--font-mono);
		font-size: 11.5px;
		font-weight: 500;
		color: var(--accent);
	}

	.hints {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.hints li {
		display: grid;
		gap: 4px;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px solid color-mix(in srgb, var(--severity-medium) 42%, transparent);
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.hint-label {
		color: var(--severity-medium);
	}

	.answer {
		display: grid;
		gap: 6px;
		justify-items: start;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--paper);
		border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
	}

	.answer-label {
		color: var(--accent);
	}

	.prose {
		font-size: 14.5px;
		line-height: 1.55;
		color: var(--ink);
	}

	.prose :global(p) {
		margin: 0 0 8px;
	}

	.prose :global(p:last-child) {
		margin-bottom: 0;
	}

	.cite {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 7px;
	}

	.verdict {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.question[data-verdict='correct'] .verdict strong {
		color: var(--severity-low);
	}

	.question[data-verdict='incorrect'] .verdict strong {
		color: var(--severity-high);
	}

	.question[data-verdict='partly'] .verdict strong {
		color: var(--severity-medium);
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	footer button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		border: 1px solid var(--line-strong);
		background: var(--paper);
		border-radius: 999px;
		padding: 7px 14px;
		font-size: 13.5px;
		color: var(--ink-soft);
		cursor: pointer;
		transition:
			border-color 180ms var(--ease),
			color 180ms var(--ease);
	}

	footer button:hover {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line-strong));
		color: var(--ink);
	}

	.ghost {
		border-color: transparent;
		background: none;
		color: var(--muted);
	}

	.left {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--muted);
	}

	.run {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
</style>
