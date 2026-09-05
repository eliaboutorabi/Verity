<script lang="ts">
	/**
	 * What she is doing, right now.
	 *
	 * The space under the character used to be empty while the conversation
	 * filled up with cards nobody asked for. This is the other way round: the
	 * running commentary lives here, compactly, and the conversation gets to be
	 * a conversation.
	 *
	 * It keeps the last few steps after they finish rather than clearing, so
	 * "what did she just do" is answerable without scrolling back.
	 */
	import {
		BookOpen01Icon,
		CheckmarkCircle02Icon,
		File01Icon,
		Legal01Icon,
		Loading03Icon,
		MapsLocation01Icon,
		Search01Icon,
		SparklesIcon,
		Alert02Icon
	} from '@hugeicons/core-free-icons';
	import Icon from './Icon.svelte';
	import { conversation, type Entry } from '$lib/state/conversation.svelte';

	interface Props {
		/** Shown when she has not done anything yet. */
		hints?: string[];
	}
	let { hints = [] }: Props = $props();

	const ICONS: Record<string, typeof Search01Icon> = {
		search_regulations: Search01Icon,
		read_regulation: Legal01Icon,
		find_rule_changes: BookOpen01Icon,
		review_document: File01Icon,
		list_documents: File01Icon,
		highlight_document: MapsLocation01Icon
	};

	/** The last few steps, newest last, so it reads like a list being written. */
	const steps = $derived(
		conversation.entries
			.filter((entry): entry is Extract<Entry, { kind: 'tool' }> => entry.kind === 'tool')
			.slice(-5)
	);

	/** A short line saying what a step actually found. */
	function detail(entry: Extract<Entry, { kind: 'tool' }>): string {
		if (entry.state === 'running') {
			const call = entry.call;
			if (call?.card === 'search') return `“${call.query}”`;
			if (call?.card === 'regulation') return call.citation;
			if (call?.card === 'review') return call.documentName;
			return '';
		}

		const result = entry.result;
		if (!result) return '';
		switch (result.card) {
			case 'results':
				return `${result.hits.length} section${result.hits.length === 1 ? '' : 's'}`;
			case 'regulation':
				return result.section.citation;
			case 'changes':
				return `${result.changes.length} document${result.changes.length === 1 ? '' : 's'}`;
			case 'review':
				return result.summary.replace(/ flagged.*/, ' flagged');
			case 'highlight':
				return `${result.marks.length} mark${result.marks.length === 1 ? '' : 's'}`;
			case 'error':
				return result.detail.slice(0, 60);
			default:
				return '';
		}
	}
</script>

<section class="activity" aria-label="What Verity is doing">
	{#if steps.length}
		<h2>Doing</h2>
		<ul>
			{#each steps as step (step.id)}
				<li data-state={step.state}>
					<span class="glyph">
						{#if step.state === 'running'}
							<Icon icon={Loading03Icon} size={13} class="spin" />
						{:else if step.state === 'error'}
							<Icon icon={Alert02Icon} size={13} />
						{:else}
							<Icon icon={CheckmarkCircle02Icon} size={13} />
						{/if}
					</span>
					<span class="text">
						<span class="what">
							<Icon icon={ICONS[step.name] ?? SparklesIcon} size={12} />
							{step.label}
						</span>
						{#if detail(step)}<span class="detail">{detail(step)}</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
	{:else if hints.length}
		<h2>She can</h2>
		<ul class="hints">
			{#each hints as hint (hint)}
				<li><span class="bullet"></span>{hint}</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.activity {
		min-width: 0;
	}

	h2 {
		margin: 0 0 8px;
		font-size: 10.5px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 7px;
	}

	li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 12.5px;
		line-height: 1.35;
		animation: rise 300ms var(--ease) both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	.glyph {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		flex: none;
		border-radius: 50%;
		color: var(--muted);
		background: color-mix(in srgb, var(--muted) 12%, transparent);
	}

	li[data-state='done'] .glyph {
		color: color-mix(in srgb, var(--severity-low) 90%, var(--ink));
		background: color-mix(in srgb, var(--severity-low) 14%, transparent);
	}

	li[data-state='running'] .glyph {
		color: var(--accent);
		background: var(--accent-soft);
	}

	li[data-state='error'] .glyph {
		color: var(--severity-high);
		background: color-mix(in srgb, var(--severity-high) 12%, transparent);
	}

	.text {
		display: grid;
		gap: 1px;
		min-width: 0;
	}

	.what {
		display: flex;
		align-items: center;
		gap: 5px;
		font-weight: 580;
		color: var(--ink-soft);
	}

	li[data-state='running'] .what {
		color: var(--accent);
	}

	.detail {
		font-size: 11.5px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ---------------------------------------------------------------- hints */

	.hints li {
		align-items: center;
		gap: 9px;
		color: var(--muted);
		font-size: 12.5px;
	}

	.bullet {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.5;
		flex: none;
	}
</style>
