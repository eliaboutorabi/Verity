<script lang="ts">
	/**
	 * A lesson, on the page rather than in the air.
	 *
	 * The point of this card is that it outlives the sentence she said. Someone
	 * learning a rule needs to be able to look back at the three things that
	 * were true about it, in order, with what each rests on — which a spoken
	 * explanation cannot give them and a paragraph of prose gives them badly.
	 */
	import type { LessonPoint } from '$lib/harness';

	let {
		topic,
		summary,
		points,
		pitfall
	}: {
		topic: string;
		summary: string;
		points: LessonPoint[];
		pitfall?: string;
	} = $props();
</script>

<article class="lesson">
	<header>
		<span class="eyebrow">Lesson</span>
		<h3>{topic}</h3>
	</header>

	<p class="summary">{summary}</p>

	<ol class="points">
		{#each points as point, index (index)}
			<li>
				<span class="n">{index + 1}</span>
				<span class="body">
					<strong>{point.heading}</strong>
					{point.detail}
					{#if point.citation}<span class="cite">{point.citation}</span>{/if}
				</span>
			</li>
		{/each}
	</ol>

	{#if pitfall}
		<p class="pitfall"><span class="pitfall-label">Where people go wrong</span>{pitfall}</p>
	{/if}
</article>

<style>
	.lesson {
		display: grid;
		gap: 12px;
		padding: 18px 20px 16px;
		border-radius: var(--radius-md);
		background: var(--surface);
		border: 1px solid var(--line-strong);
	}

	header {
		display: grid;
		gap: 4px;
	}

	.eyebrow,
	.cite,
	.pitfall-label,
	.n {
		font-family: var(--font-mono);
		font-weight: 500;
	}

	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(19px, 1.5vw, 24px);
		font-weight: 600;
		font-optical-sizing: auto;
		letter-spacing: -0.015em;
		line-height: 1.15;
	}

	.summary {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
		color: var(--ink);
	}

	.points {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}

	.points li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 11px;
		align-items: start;
	}

	.n {
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 10.5px;
		margin-top: 2px;
	}

	.body {
		display: grid;
		justify-items: start;
		gap: 4px;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-soft);
	}

	.body strong {
		color: var(--ink);
	}

	.cite {
		font-size: 10px;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 7px;
	}

	.pitfall {
		display: grid;
		gap: 4px;
		margin: 0;
		padding: 11px 13px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--severity-medium) 42%, transparent);
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.pitfall-label {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--severity-medium);
	}
</style>
