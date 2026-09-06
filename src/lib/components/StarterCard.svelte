<script lang="ts">
	/**
	 * One thing the app can do, as a card.
	 *
	 * What was here was three prompts in grey pills — a list of sentences
	 * somebody could have typed themselves, which says nothing about what the
	 * thing in front of them is for. These say it: look a rule up, read a
	 * document, learn something, be examined. Pressing one starts that, so it is
	 * still a way in, but the reason to press it is legible before you do.
	 *
	 * The icon is animated, and the animation belongs to the card rather than to
	 * the icon: an icon that only moves when the pointer lands on the icon
	 * itself is a target the size of a fingernail. The hover state lives here
	 * and is handed down.
	 */
	import type { Component } from 'svelte';

	interface Props {
		icon: Component<{ size?: number; animate?: boolean; strokeWidth?: number; class?: string }>;
		title: string;
		detail: string;
		/** Shown small at the foot of the card — what pressing it will do. */
		action: string;
		busy?: boolean;
		onclick: () => void;
	}

	let { icon: Icon, title, detail, action, busy = false, onclick }: Props = $props();

	let hovered = $state(false);
</script>

<button
	class="starter"
	type="button"
	{onclick}
	disabled={busy}
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	onfocus={() => (hovered = true)}
	onblur={() => (hovered = false)}
>
	<span class="glyph" aria-hidden="true">
		<Icon size={22} strokeWidth={1.9} animate={hovered} />
	</span>
	<span class="body">
		<span class="title">{title}</span>
		<span class="detail">{detail}</span>
	</span>
	<span class="action">{busy ? 'Loading…' : action}</span>
</button>

<style>
	.starter {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'glyph body'
			'.     action';
		gap: 4px 14px;
		align-items: start;
		width: 100%;
		text-align: left;
		/* Fills its cell, so a longer card does not leave its neighbour short. */
		align-content: start;
		padding: 16px 18px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface) 62%, transparent);
		cursor: pointer;
		transition:
			transform 200ms var(--ease),
			border-color 200ms var(--ease),
			background 200ms var(--ease);
	}

	.starter:hover:not(:disabled),
	.starter:focus-visible {
		transform: translateY(-2px);
		background: var(--surface);
		border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
	}

	.starter:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.glyph {
		grid-area: glyph;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--accent-soft);
		color: var(--accent);
		transition: background 200ms var(--ease);
	}

	.starter:hover:not(:disabled) .glyph {
		background: color-mix(in srgb, var(--accent) 22%, var(--accent-soft));
	}

	.body {
		grid-area: body;
		display: grid;
		gap: 3px;
		padding-top: 1px;
	}

	.title {
		font-size: 15px;
		font-weight: 620;
		letter-spacing: -0.005em;
		color: var(--ink);
	}

	.detail {
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--muted);
	}

	.action {
		grid-area: action;
		margin-top: 8px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
		transition: color 200ms var(--ease);
	}

	.starter:hover:not(:disabled) .action {
		color: var(--accent);
	}

	@media (max-width: 520px) {
		.starter {
			padding: 14px 15px 12px;
		}

		.glyph {
			width: 34px;
			height: 34px;
		}
	}
</style>
