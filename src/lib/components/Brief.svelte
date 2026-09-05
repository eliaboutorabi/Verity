<script lang="ts">
	/**
	 * The brief.
	 *
	 * On a wide screen this is the third column, which is also what the dead
	 * space at 1920 was always for. Below that it is a drawer off the bar. The
	 * content is the same either way: what to act on, what it rests on, and
	 * what she could not settle.
	 */
	import {
		Cancel01Icon,
		CheckmarkCircle02Icon,
		Copy01Icon,
		Delete02Icon,
		HelpCircleIcon,
		Tick02Icon
	} from '@hugeicons/core-free-icons';
	import Icon from './Icon.svelte';
	import { brief } from '$lib/state/brief.svelte';

	interface Props {
		/** Rendered as a drawer rather than a column. */
		drawer?: boolean;
		onclose?: () => void;
	}
	let { drawer = false, onclose }: Props = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(brief.asMarkdown());
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard denied. The text is still on screen to select by hand.
		}
	}
</script>

<aside class="brief" class:drawer aria-label="The brief">
	<header>
		<div class="title">
			<h2>Brief</h2>
			{#if !brief.isEmpty}
				<span class="count">{brief.outstanding} open</span>
			{/if}
		</div>
		<div class="tools">
			{#if !brief.isEmpty}
				<button class="tool" type="button" onclick={copy} title="Copy as a memo">
					<Icon icon={copied ? Tick02Icon : Copy01Icon} size={15} />
					<span>{copied ? 'Copied' : 'Copy'}</span>
				</button>
			{/if}
			{#if drawer && onclose}
				<button class="tool icon" type="button" onclick={onclose} aria-label="Close the brief">
					<Icon icon={Cancel01Icon} size={16} />
				</button>
			{/if}
		</div>
	</header>

	{#if brief.isEmpty}
		<p class="empty">
			As she works she writes down what needs acting on, and what she could not settle. It builds
			here, and you can take it away as a memo.
		</p>
	{:else}
		<div class="scroll">
			{#if brief.findings.length}
				<ul class="findings">
					{#each brief.findings as item (item.id)}
						<li data-severity={item.severity} class:done={item.done}>
							<button
								class="check"
								type="button"
								aria-pressed={item.done}
								aria-label={item.done ? `Mark ${item.topic} open` : `Mark ${item.topic} done`}
								onclick={() => brief.toggle(item.id)}
							>
								<Icon icon={CheckmarkCircle02Icon} size={16} />
							</button>
							<div class="text">
								<p class="topic">{item.topic}</p>
								<p class="detail">{item.detail}</p>
								{#if item.citation}<span class="cite">{item.citation}</span>{/if}
							</div>
							<button
								class="drop"
								type="button"
								onclick={() => brief.remove(item.id)}
								aria-label={`Remove ${item.topic}`}
							>
								<Icon icon={Delete02Icon} size={14} />
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if brief.gaps.length}
				<h3><Icon icon={HelpCircleIcon} size={13} /> Still open</h3>
				<ul class="gaps">
					{#each brief.gaps as item (item.id)}
						<li>
							<p class="topic">{item.topic}</p>
							<p class="detail">{item.detail}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.brief {
		display: flex;
		flex-direction: column;
		min-height: 0;
		gap: 12px;
	}

	.brief.drawer {
		height: 100%;
		padding: 16px 18px 18px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex: none;
	}

	.title {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: 10.5px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.count {
		font-size: 11px;
		font-weight: 640;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 8px;
	}

	.tools {
		display: flex;
		gap: 4px;
	}

	.tool {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		padding: 4px 10px;
		font-size: 11.5px;
		font-weight: 620;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 160ms var(--ease),
			background 160ms var(--ease);
	}

	.tool:hover {
		color: var(--accent);
		background: var(--accent-soft);
	}

	.tool.icon {
		padding: 4px 6px;
	}

	.empty {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.55;
		color: var(--muted);
	}

	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: grid;
		gap: 14px;
		align-content: start;
		padding-right: 2px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.findings li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 9px;
		align-items: start;
		padding: 10px 10px 11px 11px;
		border-radius: 13px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-left: 3px solid var(--severity-info);
		box-shadow: var(--shadow-card);
		animation: rise 340ms var(--ease) both;
		transition: opacity 200ms var(--ease);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	.findings li[data-severity='high'] {
		border-left-color: var(--severity-high);
	}
	.findings li[data-severity='medium'] {
		border-left-color: var(--severity-medium);
	}
	.findings li[data-severity='low'] {
		border-left-color: var(--severity-low);
	}

	.findings li.done {
		opacity: 0.5;
	}

	.findings li.done .topic {
		text-decoration: line-through;
	}

	.check,
	.drop {
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		color: var(--muted);
		display: grid;
		place-items: center;
		transition: color 160ms var(--ease);
	}

	.check {
		margin-top: 1px;
	}

	.check[aria-pressed='true'] {
		color: var(--severity-low);
	}

	.check:hover,
	.drop:hover {
		color: var(--accent);
	}

	.drop {
		opacity: 0;
	}

	.findings li:hover .drop,
	.drop:focus-visible {
		opacity: 1;
	}

	.drop:hover {
		color: var(--severity-high);
	}

	.text {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.topic {
		margin: 0;
		font-size: 13.5px;
		font-weight: 640;
		letter-spacing: -0.01em;
		line-height: 1.3;
	}

	.detail {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.cite {
		justify-self: start;
		font-size: 10.5px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 7px;
		margin-top: 2px;
	}

	h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 10.5px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.gaps li {
		padding-left: 11px;
		border-left: 2px solid var(--line);
	}

	.gaps .topic {
		font-size: 12.5px;
		font-weight: 600;
	}

	.gaps .detail {
		font-size: 12px;
		margin-top: 2px;
	}
</style>
