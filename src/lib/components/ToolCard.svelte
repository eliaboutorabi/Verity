<script lang="ts">
	/**
	 * One tool call, rendered as a card.
	 *
	 * The card kind comes from the tool's own pure presenter, so a tool decides
	 * how it looks without importing anything from the UI, and the same card
	 * renders whether the call came from a typed question or a spoken one.
	 */
	import {
		Alert02Icon,
		ArrowDown01Icon,
		BookOpen01Icon,
		CheckmarkCircle02Icon,
		File01Icon,
		HelpCircleIcon,
		Legal01Icon,
		MapsLocation01Icon,
		Search01Icon,
		SparklesIcon
	} from '@hugeicons/core-free-icons';
	import Icon from './Icon.svelte';
	import type { Entry } from '$lib/state/conversation.svelte';

	let {
		entry,
		onshow
	}: {
		entry: Extract<Entry, { kind: 'tool' }>;
		/** Open the document at a marked passage. */
		onshow?: (documentId: string, quote: string) => void;
	} = $props();

	const result = $derived(entry.result);
	const call = $derived(entry.call);
	let expanded = $state(false);

	/**
	 * Whether a card opens itself.
	 *
	 * Not a single rule, because the cards are not equally worth reading. A
	 * search is scaffolding — five sections she then narrowed down, and showing
	 * all of it buries the answer that follows. A review or a set of marks is
	 * the work product, and hiding that is hiding the point. Errors always
	 * open, because a silent failure is how someone comes to trust a wrong
	 * answer.
	 */
	const OPENS_ITSELF: Record<string, boolean> = {
		results: false,
		regulation: false,
		changes: false,
		review: true,
		highlight: true,
		// Already on screen in the brief; repeating it in the thread is noise.
		brief: false,
		// Both land in the question card above, which is where anyone is looking.
		reveal: false,
		verdict: false,
		error: false,
		generic: false
	};

	let open = $state(false);
	let touched = $state(false);

	$effect(() => {
		// Follows the card's own default until someone decides otherwise.
		if (touched || !result) return;
		open = OPENS_ITSELF[result.card] ?? false;
	});

	function toggle() {
		touched = true;
		open = !open;
	}

	/** The line a collapsed card has to earn its place with. */
	const summary = $derived.by(() => {
		if (entry.state === 'running') return '';
		const value = result;
		if (!value) return '';
		switch (value.card) {
			case 'results':
				return `${value.hits.length} section${value.hits.length === 1 ? '' : 's'} for “${value.query}”`;
			case 'regulation':
				return `${value.section.citation} — ${value.section.heading}`;
			case 'changes':
				return `${value.changes.length} document${value.changes.length === 1 ? '' : 's'} for “${value.query}”`;
			case 'review':
				return value.summary;
			case 'highlight':
				return `${value.marks.length} passage${value.marks.length === 1 ? '' : 's'} on ${value.documentName}`;
			case 'brief':
				return value.entries.map((entry) => entry.topic).join(' · ');
			case 'reveal':
				return value.what === 'hint' ? 'Hint shown above' : 'Answer shown above';
			case 'verdict':
				return value.feedback;
			case 'error':
				return value.detail;
			default:
				return value.title;
		}
	});

	const collapsible = $derived(entry.state !== 'running');

	const REGULATION_PREVIEW = 900;

	const severityLabel: Record<string, string> = {
		high: 'High',
		medium: 'Medium',
		low: 'Low',
		info: 'Note'
	};

	/** A glyph per tool, so a card is recognisable before it is read. */
	const ICONS: Record<string, typeof Search01Icon> = {
		search_regulations: Search01Icon,
		read_regulation: Legal01Icon,
		find_rule_changes: BookOpen01Icon,
		review_document: File01Icon,
		teach_concept: BookOpen01Icon,
		ask_question: HelpCircleIcon,
		reveal: HelpCircleIcon,
		score_answer: CheckmarkCircle02Icon,
		list_documents: File01Icon,
		highlight_document: MapsLocation01Icon
	};
	const icon = $derived(
		entry.state === 'error' ? Alert02Icon : (ICONS[entry.name] ?? SparklesIcon)
	);
</script>

<article class="card" data-state={entry.state} aria-busy={entry.state === 'running'}>
	{#snippet head()}
		<span class="glyph" aria-hidden="true">
			<Icon {icon} size={14} />
		</span>
		<span class="head-text">
			<span class="label">{entry.label}</span>
			{#if summary}<span class="summary">{summary}</span>{/if}
		</span>
		{#if entry.state === 'running'}
			<span class="timing">working…</span>
		{:else if entry.durationMs !== undefined}
			<span class="timing">{(entry.durationMs / 1000).toFixed(1)}s</span>
		{/if}
	{/snippet}

	{#if collapsible}
		<button class="head" type="button" aria-expanded={open} onclick={toggle}>
			{@render head()}
			<span class="chevron" class:open aria-hidden="true">
				<Icon icon={ArrowDown01Icon} size={15} />
			</span>
		</button>
	{:else}
		<div class="head">{@render head()}</div>
	{/if}

	{#if open || entry.state === 'running'}
	<div class="body-slot">

	{#if entry.state === 'running'}
		<p class="pending">
			{#if call?.card === 'search'}
				Searching <strong>{call.title}</strong> for “{call.query}”
			{:else if call?.card === 'regulation'}
				Pulling <strong>{call.citation}</strong>
			{:else if call?.card === 'review'}
				Reading <strong>{call.documentName}</strong>
			{:else if call?.card === 'generic'}
				{call.title}
			{:else}
				Working…
			{/if}
		</p>
	{:else if result?.card === 'results'}
		<p class="lead">
			{result.hits.length} section{result.hits.length === 1 ? '' : 's'} for “{result.query}”{result.truncated
				? ', best matches first'
				: ''}
		</p>
		<ul class="hits">
			{#each result.hits as hit, index (`${hit.citation}#${index}`)}
				<li>
					<a href={hit.url} target="_blank" rel="noopener noreferrer">
						<span class="citation">{hit.citation}</span>
						<span class="heading">{hit.heading}</span>
					</a>
					<p class="hierarchy">{hit.hierarchy}</p>
					{#if hit.excerpt}
						<p class="excerpt">{hit.excerpt}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if result?.card === 'regulation'}
		<a class="section-head" href={result.section.url} target="_blank" rel="noopener noreferrer">
			<span class="citation">{result.section.citation}</span>
			<span class="heading">{result.section.heading}</span>
		</a>
		<p class="hierarchy">{result.section.hierarchy}</p>
		<div class="body" class:clipped={!expanded}>
			{expanded ? result.body : result.body.slice(0, REGULATION_PREVIEW)}
		</div>
		{#if result.body.length > REGULATION_PREVIEW}
			<button class="more" type="button" onclick={() => (expanded = !expanded)}>
				{expanded ? 'Show less' : 'Read the full section'}
			</button>
		{/if}
	{:else if result?.card === 'changes'}
		<p class="lead">Rule-making matching “{result.query}”</p>
		<ul class="changes">
			{#each result.changes as change, index (`${change.url}#${index}`)}
				<li>
					<a href={change.url} target="_blank" rel="noopener noreferrer">{change.title}</a>
					<p class="meta">
						<span class="tag">{change.type}</span>
						{change.agency} · published {change.publishedOn}
						{#if change.effectiveOn}· <strong>effective {change.effectiveOn}</strong>{/if}
					</p>
					{#if change.cfrReferences?.length}
						<p class="hierarchy">Amends {change.cfrReferences.join(', ')}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if result?.card === 'review'}
		<p class="lead">{result.documentName} — {result.summary}</p>
		<ul class="findings">
			{#each result.findings as finding, index (index)}
				<li data-severity={finding.severity}>
					<p class="finding-head">
						<span class="severity">{severityLabel[finding.severity] ?? finding.severity}</span>
						{finding.topic}
					</p>
					<blockquote>{finding.quote}</blockquote>
					<p class="concern">{finding.concern}</p>
				</li>
			{/each}
		</ul>
	{:else if result?.card === 'highlight'}
		<div class="marked">
			<p class="lead">
				{result.marks.length}
				{result.marks.length === 1 ? 'passage' : 'passages'} marked on {result.documentName}
			</p>
			<!--
				Marking a document with no way to see it is the same as not marking
				it. The rows below open the page at one passage; this opens it at
				the first, and is the thing anybody looks for.
			-->
			<button
				class="open-doc"
				type="button"
				onclick={() => onshow?.(result.documentId, result.marks[0]?.quote ?? '')}
			>
				<Icon icon={MapsLocation01Icon} size={15} />
				Open the document
			</button>
		</div>
		<ul class="marks">
			{#each result.marks as mark, index (index)}
				<li data-severity={mark.severity}>
					<button type="button" onclick={() => onshow?.(result.documentId, mark.quote)}>
						<span class="mark-note">{mark.note}</span>
						<span class="mark-quote">“{mark.quote}”</span>
						<Icon icon={MapsLocation01Icon} size={15} />
					</button>
				</li>
			{/each}
		</ul>
	{:else if result?.card === 'brief'}
		<ul class="brief-echo">
			{#each result.entries as entry, index (index)}
				<li data-severity={entry.severity}>
					<strong>{entry.topic}</strong>
					{entry.detail}
					{#if entry.citation}<span class="cite">{entry.citation}</span>{/if}
				</li>
			{/each}
		</ul>
	{:else if result?.card === 'error'}
		<p class="failure">{result.detail}</p>
	{:else if result?.card === 'generic'}
		<p class="lead">{result.title}</p>
		{#if result.detail}<p class="excerpt">{result.detail}</p>{/if}
	{/if}
	</div>
	{/if}
</article>

<style>
	.card {
		min-width: 0;
		overflow-wrap: anywhere;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		padding: 14px 16px 16px;
		animation: rise 380ms var(--ease) both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted);
	}

	button.head {
		cursor: pointer;
	}

	button.head:hover .label {
		color: var(--accent);
	}

	.head-text {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	/*
	 * The line a collapsed card lives or dies by. Sentence case and full size,
	 * because it is the content — the label above it is the chrome.
	 */
	.summary {
		font-size: 13px;
		font-weight: 520;
		letter-spacing: -0.005em;
		text-transform: none;
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		display: grid;
		place-items: center;
		flex: none;
		color: var(--muted);
		transition: transform 200ms var(--ease);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.body-slot {
		animation: open 220ms var(--ease) both;
	}

	@keyframes open {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.glyph {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 8px;
		flex: none;
		background: var(--accent-soft);
		color: var(--accent);
	}

	[data-state='running'] .glyph {
		animation: breathe 1.5s ease-in-out infinite;
	}

	/*
	 * Identifiable, not alarming. A tool she asked the wrong way and then asked
	 * again correctly is a step in the loop, and colouring it like a failure
	 * makes three of them look like the app is coming apart.
	 */
	[data-state='error'] .glyph {
		background: color-mix(in srgb, var(--severity-medium) 12%, var(--surface));
		color: var(--severity-medium);
	}

	@keyframes breathe {
		50% {
			opacity: 0.45;
		}
	}

	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 160ms var(--ease);
	}

	.timing {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: none;
	}

	.pending {
		margin: 8px 0 0;
		color: var(--muted);
		font-size: 14px;
	}

	.lead {
		margin: 8px 0 0;
		font-size: 13px;
		color: var(--muted);
	}

	ul {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}

	/*
	 * No rules down the side. A column of vertical lines beside every result
	 * reads as scaffolding, and there is nothing here it needs to hold up —
	 * the citation badge already says where one entry ends and the next begins.
	 */
	.hits li,
	.changes li {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--paper);
	}

	.findings li {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--paper);
		border: 1px solid color-mix(in srgb, var(--severity-info) 42%, transparent);
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	a:hover .heading,
	a:hover .citation {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.citation {
		display: inline-block;
		/*
		 * A citation is a reference number, not a phrase. Set in prose type it
		 * reads as words; set in mono it reads as a label you can scan a column
		 * of, and the section numbers line up.
		 */
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 8px;
		margin-bottom: 5px;
		font-variant-numeric: tabular-nums;
	}

	.heading {
		display: block;
		font-size: 15px;
		font-weight: 620;
		letter-spacing: -0.01em;
		line-height: 1.3;
		margin-top: 2px;
	}

	.section-head {
		display: block;
		margin-top: 10px;
	}

	.hierarchy {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.excerpt,
	.concern {
		margin: 6px 0 0;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--ink-soft);
	}

	.body {
		margin-top: 12px;
		overflow-wrap: anywhere;
		font-size: 14px;
		line-height: 1.62;
		white-space: pre-wrap;
		color: var(--ink-soft);
	}

	.body.clipped {
		-webkit-mask-image: linear-gradient(to bottom, #000 72%, transparent);
		mask-image: linear-gradient(to bottom, #000 72%, transparent);
		max-height: 22em;
		overflow: hidden;
	}

	.more {
		margin-top: 10px;
		border: 1px solid var(--line);
		background: var(--paper);
		border-radius: 999px;
		padding: 6px 14px;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background 160ms var(--ease);
	}

	.more:hover {
		background: var(--accent-soft);
	}

	.changes a {
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.35;
		display: block;
	}

	.meta {
		margin: 5px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.tag {
		display: inline-block;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 1px 8px;
		font-weight: 700;
		font-size: 11px;
		margin-right: 6px;
	}

	.findings li[data-severity='high'] {
		border-color: color-mix(in srgb, var(--severity-high) 46%, transparent);
	}
	.findings li[data-severity='medium'] {
		border-color: color-mix(in srgb, var(--severity-medium) 46%, transparent);
	}
	.findings li[data-severity='low'] {
		border-color: color-mix(in srgb, var(--severity-low) 46%, transparent);
	}

	.finding-head {
		margin: 0;
		font-size: 14.5px;
		font-weight: 640;
		letter-spacing: -0.01em;
	}

	.severity {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		margin-right: 8px;
		vertical-align: 1px;
	}

	li[data-severity='high'] .severity {
		color: var(--severity-high);
	}
	li[data-severity='medium'] .severity {
		color: var(--severity-medium);
	}

	blockquote {
		margin: 6px 0 0;
		padding: 8px 12px;
		background: var(--paper);
		border-radius: var(--radius-sm);
		font-size: 13.5px;
		line-height: 1.5;
		font-style: italic;
		color: var(--ink-soft);
	}

	/* ---------------------------------------------------------------- marks */

	.marked {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 14px;
		margin-bottom: 10px;
	}

	.marked .lead {
		margin: 0;
	}

	.open-doc {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 6px 13px;
		font-size: 13px;
		font-weight: 620;
		cursor: pointer;
		transition: background 180ms var(--ease);
	}

	.open-doc:hover {
		background: color-mix(in srgb, var(--accent) 22%, var(--accent-soft));
	}

	.marks {
		gap: 6px;
	}

	.marks li {
		padding: 0;
	}

	.marks button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		text-align: left;
		border: 1px solid color-mix(in srgb, var(--severity-info) 42%, transparent);
		border-radius: 10px;
		background: var(--paper);
		padding: 8px 11px;
		cursor: pointer;
		color: var(--muted);
		transition:
			background 160ms var(--ease),
			border-color 160ms var(--ease);
	}

	.marks button:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.marks li[data-severity='high'] button {
		border-color: color-mix(in srgb, var(--severity-high) 46%, transparent);
	}
	.marks li[data-severity='medium'] button {
		border-color: color-mix(in srgb, var(--severity-medium) 46%, transparent);
	}
	.marks li[data-severity='low'] button {
		border-color: color-mix(in srgb, var(--severity-low) 46%, transparent);
	}

	.mark-note {
		font-size: 13.5px;
		font-weight: 620;
		color: var(--ink);
		white-space: nowrap;
	}

	.mark-quote {
		flex: 1;
		min-width: 0;
		font-size: 12.5px;
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.brief-echo {
		gap: 8px;
		margin-top: 10px;
	}

	.brief-echo li {
		padding: 9px 11px;
		border-radius: 11px;
		background: var(--paper);
		border: 1px solid color-mix(in srgb, var(--severity-info) 42%, transparent);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-soft);
	}

	.brief-echo li[data-severity='high'] {
		border-color: color-mix(in srgb, var(--severity-high) 46%, transparent);
	}
	.brief-echo li[data-severity='medium'] {
		border-color: color-mix(in srgb, var(--severity-medium) 46%, transparent);
	}

	.brief-echo strong {
		display: block;
		font-weight: 640;
		color: var(--ink);
	}

	.brief-echo .cite {
		display: inline-block;
		margin-top: 4px;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 7px;
	}

	.failure {
		margin: 8px 0 0;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--severity-high);
	}
</style>
