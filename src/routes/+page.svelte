<script lang="ts">
	/**
	 * Verity — the whole app.
	 *
	 * The robot is mounted from the first paint, before a key is entered, so the
	 * character is the first thing a visitor sees rather than a form. Voice and
	 * text share one transcript and one tool registry; the only difference is
	 * which transport carries the turn.
	 */
	import { onMount, tick } from 'svelte';
	import { MOUTH_AT_REST, type MouthPose } from '$lib/client/lipsync';
	import { extractText } from '$lib/client/extract';
	import StarterCard from '$lib/components/StarterCard.svelte';
	import BookOpenText from '@jis3r/icons/icons/book-open-text';
	import CircleQuestionMark from '@jis3r/icons/icons/circle-question-mark';
	import Gavel from '@jis3r/icons/icons/gavel';
	import ScanText from '@jis3r/icons/icons/scan-text';
	import {
		ClipboardIcon,
		Comment01Icon,
		Moon02Icon,
		Settings02Icon,
		Sun03Icon
	} from '@hugeicons/core-free-icons';
	import Activity from '$lib/components/Activity.svelte';
	import Brief from '$lib/components/Brief.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import DocumentViewer from '$lib/components/DocumentViewer.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import KeyGate from '$lib/components/KeyGate.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import RobotStage from '$lib/components/RobotStage.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import Transcript from '$lib/components/Transcript.svelte';
	import VoiceControls from '$lib/components/VoiceControls.svelte';
	import { streamTurn } from '$lib/client/chat';
	import { VoiceSession, type VoiceStatus } from '$lib/client/voice';
	import { brain } from '$lib/state/brain.svelte';
	import { brief } from '$lib/state/brief.svelte';
	import { study } from '$lib/state/study.svelte';
	import { conversation } from '$lib/state/conversation.svelte';
	import { documents } from '$lib/state/documents.svelte';
	import { pages } from '$lib/state/pages.svelte';
	import { session } from '$lib/state/session.svelte';
	import { CHARACTERS, type CharacterId } from '$lib/voices';

	let stage = $state<ReturnType<typeof RobotStage> | null>(null);
	let composer = $state<ReturnType<typeof Composer> | null>(null);

	let unlocked = $state(false);
	let settingsOpen = $state(false);
	let viewing = $state<string | null>(null);
	let briefOpen = $state(false);
	/** True once the window is wide enough for the brief to be a column. */
	let wide = $state(false);

	let voiceStatus = $state<VoiceStatus>('idle');
	let voiceActive = $state(false);
	let audioLevel = $state(0);
	let mouth = $state<MouthPose>(MOUTH_AT_REST);
	let voiceMuted = $state(false);
	let audible = $state(false);
	let starting = $state(false);

	let textBusy = $state(false);
	/** True from the first text delta until the turn settles. */
	let textStreaming = $state(false);
	let abort: AbortController | null = null;

	const character = $derived(CHARACTERS[session.character]);

	/** What the robot should be doing. Voice wins when a session is live. */
	const robotMode = $derived(
		voiceActive
			? voiceStatus === 'speaking'
				? 'speaking'
				: voiceStatus === 'thinking'
					? 'thinking'
					: voiceStatus === 'listening'
						? 'listening'
						: 'idle'
			: textStreaming
				? 'speaking'
				: textBusy
					? 'thinking'
					: 'idle'
	);

	const voice = new VoiceSession({
		onStatus: (status) => {
			voiceStatus = status;
			voiceActive = voice.active;
		},
		onUserTranscript: (text) => conversation.addUser(text, 'voice'),
		onAssistantDelta: (delta) => {
			conversation.appendAssistant(delta, 'voice');
			stage?.appendTranscript(delta);
		},
		onAssistantDone: () => conversation.settleAssistant(),
		onToolCall: (callId, name, view) => {
			conversation.startTool(callId, name, toolLabel(name), view);
		},
		onToolResult: (callId, isError, view, durationMs) => {
			conversation.finishTool(callId, isError, view, durationMs);
			absorbMarks(view as never);
			absorbBrief(view as never);
			absorbStudy(view as never);
		},
		onError: (message) => conversation.addNotice(message),
		// Asked for at connect time, including after a reconnect, so a dropped
		// session comes back knowing everything said before it dropped.
		transcript: () => conversation.toMessages(),
		askedQuestions: () => study.drawn,
		openQuestion: () => study.hasOpenQuestion,
		onReview: (status, reasons) => {
			// A listener is not looking at the screen, so the correction is spoken.
			// The badge is for whoever is.
			if (status === 'clean') conversation.markChecked();
			else conversation.markVoiceRevision(reasons);
		},
		onAudioLevel: (level, isAudible, pose) => {
			audioLevel = level;
			audible = isAudible;
			mouth = pose;
		}
	});

	/**
	 * Voice-mode calls arrive with only a name, since the schemas live server
	 * side. This keeps the card headings readable without a round trip.
	 */
	const TOOL_LABELS: Record<string, string> = {
		search_regulations: 'Searching the eCFR',
		read_regulation: 'Reading the regulation',
		find_rule_changes: 'Checking the Federal Register',
		review_document: 'Reviewing the document',
		list_documents: 'Checking loaded documents'
	};
	const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;

	/**
	 * A highlight is decided on the server and placed in the browser.
	 *
	 * The tool names passages; matching them to a position needs the OCR, which
	 * lives in this tab along with the file. So every finished tool result is
	 * checked for marks, whichever transport carried it.
	 */
	/** Anything she wrote down lands in the brief, whichever mode wrote it. */
	function absorbBrief(view?: { card: string } & Record<string, unknown>) {
		if (view?.card !== 'brief') return;
		brief.add(view.entries as never);
	}

	/**
	 * The exam, which the browser runs rather than she does.
	 *
	 * She writes the question, its hints and its answer in one call; what is
	 * visible is decided here. So a reveal is a flag flipping in a store, not a
	 * message she has to be trusted not to say early.
	 */
	function absorbStudy(view?: { card: string } & Record<string, unknown>) {
		switch (view?.card) {
			case 'question':
				study.ask(view.question as never);
				break;
			case 'reveal':
				if (view.what === 'hint') study.revealHint();
				else study.revealAnswer();
				break;
			case 'verdict':
				study.score(view.verdict as never, view.feedback as string);
				break;
		}
	}

	function absorbMarks(view?: { card: string } & Record<string, unknown>) {
		if (view?.card !== 'highlight') return;
		const documentId = view.documentId as string;
		const marks = view.marks as { quote: string; note: string; severity: 'high' | 'medium' | 'low' | 'info' }[];
		for (const mark of marks) pages.add(documentId, mark.quote, mark.note, mark.severity);
		// Reading is what turns a quote into a place, and it takes a moment —
		// start it now rather than when the viewer opens.
		if (marks.length) void pages.read(documentId);
	}

	function showOnPage(documentId: string, quote: string) {
		viewing = documentId;
		const highlight = pages
			.forDocument(documentId)
			.find((candidate) => candidate.quote === quote);
		if (highlight) pages.reveal(highlight.id);
	}

	onMount(() => {
		// A remembered key still gets checked, so a revoked one fails at the
		// gate rather than three seconds into the first answer.
		if (session.hasKey) void session.verify().then((ok) => (unlocked = ok));

		if (import.meta.env.DEV) {
			// A console handle for inspecting the character while developing.
			// onMount only, because this module is also rendered on the server.
			(window as unknown as Record<string, unknown>).__verity = {
				robot: () => stage?.debugState(),
				// Poses her mouth by hand, which is the only way to look at one
				// shape for long enough to judge it.
				setMouth: (pose: Partial<MouthPose>) => (mouth = { ...MOUTH_AT_REST, ...pose }),
				voice: () => ({ status: voiceStatus, active: voiceActive, level: audioLevel, audible })
			};
		}

		// The brief earns a column of its own only when there is a column to
		// spare; below that it is a drawer, so it never squeezes the answer.
		const dark = window.matchMedia('(prefers-color-scheme: dark)');
		const followSystem = () => session.systemThemeChanged(dark.matches ? 'dark' : 'light');
		dark.addEventListener('change', followSystem);

		const columns = window.matchMedia('(min-width: 1280px)');
		const sync = () => (wide = columns.matches);
		sync();
		columns.addEventListener('change', sync);

		return () => {
			dark.removeEventListener('change', followSystem);
			columns.removeEventListener('change', sync);
			voice.stop();
		};
	});

	// The character drives the accent colour for the whole document.
	$effect(() => {
		document.documentElement.dataset.character = session.character;
	});

	// And the theme drives everything else. The head script set this before the
	// first paint; from here it is ours.
	$effect(() => {
		document.documentElement.dataset.theme = session.theme;
	});

	/**
	 * Stop her hearing the room, without hanging up.
	 *
	 * Muting only disables the outgoing track, so the connection, the tools and
	 * everything already said stay exactly where they were — which is the point:
	 * thinking out loud for a minute should not cost you the conversation.
	 */
	function toggleMute() {
		voice.setMuted(!voice.muted);
		voiceMuted = voice.muted;
	}

	function endVoice() {
		voice.stop();
		voiceActive = false;
		voiceMuted = false;
	}

	async function toggleVoice() {
		if (voice.active) {
			endVoice();
			return;
		}
		starting = true;
		try {
			await voice.start({
				apiKey: session.apiKey,
				character: session.character,
				documents: documents.payload(),
				brain: brain.payload(),
				// Only greet a cold start; mid-conversation, just start listening.
				greet: conversation.isEmpty
			});
			voiceActive = voice.active;
			voiceMuted = voice.muted;
			stage?.beginResponse();
		} catch {
			// The session already reported it through onError.
			voiceActive = false;
		} finally {
			starting = false;
		}
	}

	function switchCharacter(next: CharacterId) {
		if (next === session.character) return;
		const wasActive = voice.active;
		// A realtime voice cannot change mid-session, so the session has to end.
		if (wasActive) voice.stop();
		session.setCharacter(next);
		voiceActive = false;
		if (wasActive) {
			conversation.addNotice(
				`Switched to ${CHARACTERS[next].displayName}. Start a new conversation to hear the new voice.`,
				'info'
			);
		}
	}

	async function send(text: string) {
		// Typing into a live voice session joins the conversation already running
		// rather than starting a competing one.
		if (voice.active && voice.say(text)) {
			conversation.addUser(text, 'voice');
			return;
		}

		conversation.addUser(text, 'text');
		const messages = conversation.toMessages();

		textBusy = true;
		conversation.busy = true;
		abort = new AbortController();
		stage?.beginResponse();

		try {
			for await (const event of streamTurn({
				apiKey: session.apiKey,
				model: session.model,
				messages,
				documents: documents.payload(),
				brain: brain.payload(),
				askedQuestions: study.drawn,
				openQuestion: study.hasOpenQuestion,
				signal: abort.signal
			})) {
				conversation.applyAgentEvent(event);
				if (event.type === 'tool-result') {
					absorbMarks(event.view as never);
					absorbBrief(event.view as never);
					absorbStudy(event.view as never);
				}
				if (event.type === 'text') {
					textStreaming = true;
					stage?.appendTranscript(event.delta);
				}
				// A tool call between paragraphs stops the printer until prose resumes.
				if (event.type === 'tool-call') textStreaming = false;
			}
		} catch (cause) {
			if (!abort.signal.aborted) {
				conversation.addNotice(
					cause instanceof Error ? cause.message : 'That turn could not be completed.'
				);
			}
		} finally {
			conversation.settleAssistant();
			textBusy = false;
			textStreaming = false;
			conversation.busy = false;
			abort = null;
		}
	}

	function stopTurn() {
		abort?.abort();
		conversation.settleAssistant();
		textBusy = false;
		textStreaming = false;
		conversation.busy = false;
	}

	function startOver() {
		stopTurn();
		voice.stop();
		voiceActive = false;
		conversation.reset();
		documents.clear();
		pages.clear();
		brief.clear();
		study.clear();
		briefOpen = false;
		viewing = null;
		stage?.clearTranscript();
		settingsOpen = false;
	}

	/** Shown under her before she has done anything, in place of empty space. */
	const CAPABILITIES = [
		'Search and read the live CFR',
		'Check the Federal Register for changes',
		'Review a document and mark the page'
	];

	/**
	 * She looks at what just happened.
	 *
	 * A character that never looks at anything is a screensaver. When a card
	 * lands she turns to it; when she starts answering she turns back to the
	 * reader, because that is who the answer is for. The gaze releases itself
	 * after a few seconds, so she is never left staring.
	 */
	$effect(() => {
		const last = conversation.entries.at(-1);
		if (!last) return;

		void tick().then(() => {
			if (last.kind === 'tool') {
				const cards = document.querySelectorAll('.thread article.card');
				stage?.look(cards[cards.length - 1] ?? null);

				// A high finding is worth a flicker of concern; it is the moment
				// she would look up at you across a desk.
				if (last.state === 'done' && last.result?.card === 'review') {
					const worst = last.result.findings[0]?.severity;
					if (worst === 'high') stage?.react('concern');
				}
				if (last.state === 'done' && last.result?.card === 'highlight') {
					stage?.react('nod');
				}
			} else if (last.kind === 'assistant') {
				// Back to the reader. Nothing to aim at, so hand her to the pointer.
				stage?.look(null);
			}
		});
	});

	/**
	 * Her keys do something.
	 *
	 * Not a gimmick if it is useful: equals asks her to sum up where the
	 * conversation has got to, which is the thing you actually want after five
	 * lookups. The others are ambient — they click, she likes it, nothing else
	 * happens.
	 */
	function onKeyPress(index: number) {
		if (index !== 3 || !unlocked || textBusy) return;
		if (conversation.isEmpty) return;
		send('Sum up where we have got to, in three sentences.');
	}

	/**
	 * What the app is for, as four ways in.
	 *
	 * Templates rather than prompts. Three grey pills of sentences somebody
	 * could have typed themselves said nothing about what this thing does; these
	 * say it, and pressing one starts it.
	 */
	const STARTERS = [
		{
			icon: Gavel,
			title: 'Look up a rule',
			detail: 'Searches the live CFR, reads the section, and cites what it read.',
			action: 'Ask about a business meal',
			run: () => send('What has to be true for a business meal to be deductible?')
		},
		{
			icon: ScanText,
			title: 'Review a document',
			detail: 'Names the passages a reviewer would stop at, and the rule behind each.',
			action: 'Try a specimen letter',
			run: () => reviewSample()
		},
		{
			icon: BookOpenText,
			title: 'Learn a rule properly',
			detail: 'A lesson on screen: what it says, what turns on it, where people slip.',
			action: 'Substantiating travel',
			run: () => send('Teach me how the CFR treats substantiation of travel expenses.')
		},
		{
			icon: CircleQuestionMark,
			title: 'Sit an exam',
			detail: 'Questions with the hints and the answer held back until you ask.',
			action: 'Passive activity losses',
			run: () => send('Quiz me on passive activity losses. One question at a time.')
		}
	];

	/**
	 * Documents to try, for someone who arrived without one.
	 *
	 * Specimens, not anybody's paperwork — every party and figure in them is
	 * invented — but written the way the real thing is written, so the review
	 * has something to actually bite on rather than a paragraph of keywords.
	 */
	const SAMPLES = [
		{ name: 'Residential lease', file: 'residential-lease-1420-maple.pdf' },
		{ name: 'Contractor agreement', file: 'contractor-agreement-northbridge.pdf' },
		{ name: 'Engagement letter', file: 'engagement-letter-brightline.pdf' }
	];

	let loadingSample = $state<string | null>(null);

	/** Load the engagement letter and set her on it, in one press. */
	async function reviewSample() {
		await loadSample(SAMPLES[2]);
		if (documents.total) await send('Review this and tell me what worries you.');
	}

	async function loadSample(sample: { name: string; file: string }) {
		loadingSample = sample.file;
		try {
			const response = await fetch(`/samples/${sample.file}`);
			if (!response.ok) throw new Error('That sample could not be fetched.');
			const file = new File([await response.blob()], sample.file, { type: 'application/pdf' });
			documents.add(sample.file, await extractText(file), 'file', file);
		} catch (cause) {
			conversation.addNotice(
				cause instanceof Error ? cause.message : 'That sample could not be loaded.'
			);
		} finally {
			loadingSample = null;
		}
	}
</script>

<svelte:head>
	<title>Verity — Regulations Assistant</title>
	<meta
		name="description"
		content="Talk to a small robot that looks up federal tax and financial regulations in the actual Code of Federal Regulations."
	/>
	<meta name="theme-color" content="#dfdcd6" />
</svelte:head>

<div class="app">
	<header class="bar">
		<a class="brand" href="/" aria-label="Verity, regulations assistant">
			<Logo size={30} />
			<span>Verity</span>
		</a>

		<div class="bar-actions">
			{#if unlocked}
				{#if !wide && !brief.isEmpty}
					<button
						class="bar-button"
						type="button"
						onclick={() => (briefOpen = true)}
						aria-label="Open the brief"
					>
						<Icon icon={ClipboardIcon} size={17} />
						<span>Brief</span>
						{#if brief.outstanding}<span class="pip">{brief.outstanding}</span>{/if}
					</button>
				{/if}
				<button class="bar-button" type="button" onclick={startOver} disabled={conversation.isEmpty}>
					<Icon icon={Comment01Icon} size={17} />
					<span>New</span>
				</button>
				<button
					class="bar-button icon-only"
					type="button"
					aria-label={session.theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
					title={session.theme === 'dark' ? 'Light' : 'Dark'}
					aria-pressed={session.theme === 'dark'}
					onclick={() => session.toggleTheme()}
				>
					<Icon icon={session.theme === 'dark' ? Sun03Icon : Moon02Icon} size={18} />
				</button>
				<button
					class="bar-button icon-only"
					type="button"
					aria-label="Settings"
					title="Settings"
					onclick={() => (settingsOpen = true)}
				>
					<Icon icon={Settings02Icon} size={18} />
				</button>
			{/if}
		</div>
	</header>

	<main>
		<section class="stage-col">
			<div class="stage-frame">
				<RobotStage
					bind:this={stage}
					character={session.character}
					dark={session.theme === 'dark'}
					mode={robotMode}
					{audioLevel}
					{mouth}
					{audible}
					printing={textStreaming}
					onkeypress={onKeyPress}
				/>
			</div>

			<div class="controls">
				<VoiceControls
					status={voiceStatus}
					active={voiceActive}
					muted={voiceMuted}
					level={audioLevel}
					disabled={!unlocked || starting || !session.realtimeAvailable}
					unavailable={!unlocked
						? 'Add a key to begin'
						: !session.realtimeAvailable
							? 'Voice needs Realtime access on this key'
							: undefined}
					onstart={toggleVoice}
					onend={endVoice}
					onmute={toggleMute}
				/>
			</div>

			{#if unlocked}
				<div class="deck fade-edges">
					<Activity hints={CAPABILITIES} />
				</div>
			{/if}
		</section>

		<section class="work-col">
			{#if !unlocked}
				<div class="pane">
					<KeyGate onready={() => (unlocked = true)} />
				</div>
			{:else}
				<div class="pane">
					{#if conversation.isEmpty}
						<div class="opening">
							<h2>What are you checking?</h2>
							<p>
								Verity reads the live Code of Federal Regulations before she answers, and cites what
								she read.
							</p>
							<ul class="starters">
								{#each STARTERS as starter (starter.title)}
									<li>
										<StarterCard
											icon={starter.icon}
											title={starter.title}
											detail={starter.detail}
											action={starter.action}
											busy={loadingSample !== null}
											onclick={starter.run}
										/>
									</li>
								{/each}
							</ul>

							<p class="samples">
								<span>Or try a specimen:</span>
								{#each SAMPLES as sample (sample.file)}
									<button
										type="button"
										disabled={loadingSample !== null}
										onclick={() => loadSample(sample)}
									>
										{loadingSample === sample.file ? 'Reading…' : sample.name}
									</button>
								{/each}
							</p>
						</div>
					{:else}
						<Transcript onshow={showOnPage} onsend={send} />
					{/if}
				</div>

				{#if conversation.citations.length}
					<div class="rail" aria-label="Regulations cited in this session">
						{#each conversation.citations as citation (citation.citation)}
							<a
								href={citation.url}
								target="_blank"
								rel="noopener noreferrer"
								title={citation.heading}
							>
								{citation.citation}
							</a>
						{/each}
					</div>
				{/if}

				<div class="composer-slot">
					<Composer
						bind:this={composer}
						busy={textBusy}
						disabled={textBusy}
						placeholder={voiceActive ? 'Type while you talk…' : 'Ask about a regulation…'}
						onsend={send}
						onstop={stopTurn}
						onopen={(id) => (viewing = id)}
					/>
				</div>
			{/if}
		</section>

		{#if unlocked && wide}
			<section class="brief-col">
				<Brief />
			</section>
		{/if}
	</main>

	{#if briefOpen && !wide}
		<div
			class="scrim"
			role="presentation"
			onclick={() => (briefOpen = false)}
		></div>
		<div class="brief-drawer" role="dialog" aria-label="The brief">
			<Brief drawer onclose={() => (briefOpen = false)} />
		</div>
	{/if}
</div>

<DocumentViewer documentId={viewing} onclose={() => (viewing = null)} />

<SettingsDialog
	open={settingsOpen}
	onclose={() => (settingsOpen = false)}
	oncharacter={switchCharacter}
	onforget={() => {
		startOver();
		session.forgetKey();
		unlocked = false;
	}}
/>

<style>
	/*
	 * Layout.
	 *
	 * The previous version was a centred two-column card that stretched: at
	 * 1920 everything was marooned in dead space, on a tall window the pieces
	 * drifted apart, and on a phone she shrank to a postage stamp. The model
	 * here is a workspace instead — a rail of a bounded width holding her, and
	 * a work column that takes what is left with its text capped at a readable
	 * measure. Nothing is vertically centred, because centred content moves
	 * when the window does.
	 */
	/*
	 * One row, not two. The bar is `position: fixed`, so it occupies no grid
	 * row — declaring `auto 1fr` put `main` in the auto row at content height
	 * and left the 1fr row empty, which is why the whole app sat in a band
	 * across the top with the composer stranded under it.
	 */
	.app {
		height: 100dvh;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
	}

	/* ------------------------------------------------------------------ bar */

	.bar {
		position: fixed;
		inset: 0 0 auto;
		z-index: 40;
		height: var(--bar-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 clamp(14px, 2.6vw, 40px);
		/*
		 * Nothing behind it.
		 *
		 * A frosted bar has to tint and blur whatever it sits on, and the page
		 * sits on a vertical gradient — so the bar sampled a different colour
		 * from the one beside it and drew a band across the top of the app. The
		 * background is one continuous wash now, and the bar's own controls
		 * carry their own surfaces. What stops text colliding with it is the
		 * mask on the columns below, which fades content out before it arrives
		 * rather than sliding it under a pane of glass.
		 */
		background: none;
		pointer-events: none;
	}

	.bar > * {
		pointer-events: auto;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		text-decoration: none;
		color: inherit;
		min-width: 0;
	}

	.brand span {
		font-size: 16px;
		font-weight: 680;
		letter-spacing: -0.025em;
	}

	.bar-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.bar-button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 34px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface) 70%, transparent);
		color: var(--ink-soft);
		font-size: 13px;
		font-weight: 620;
		cursor: pointer;
		transition:
			background 160ms var(--ease),
			color 160ms var(--ease),
			opacity 160ms var(--ease);
	}

	.bar-button.icon-only {
		width: 34px;
		padding: 0;
		justify-content: center;
	}

	.bar-button:hover:not(:disabled) {
		background: var(--surface);
		color: var(--accent);
	}

	.bar-button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* ----------------------------------------------------------------- main */

	main {
		display: grid;
		/* A rail, not a fraction: past ~420px she is a spectacle, not a colleague. */
		grid-template-columns: clamp(288px, 25vw, 420px) minmax(0, 1fr);
		/*
		 * One row that fills. Without this the implicit row is `auto`, the
		 * columns size to their content, and the whole app sits in a band
		 * across the top of the window with the composer stranded under it.
		 */
		grid-template-rows: minmax(0, 1fr);
		gap: clamp(18px, 2.6vw, 48px);
		padding: calc(var(--bar-height) + 10px) clamp(14px, 2.6vw, 40px)
			clamp(12px, 1.6vw, 22px);
		width: 100%;
		max-width: 1720px;
		margin-inline: auto;
		min-height: 0;
	}

	main > * {
		min-width: 0;
	}

	.stage-col {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		align-content: start;
		gap: clamp(10px, 1.6vh, 20px);
		min-height: 0;
	}

	/*
	 * She sizes to the rail and squares off, so she is the same shape at every
	 * width. `min-height: 0` on the row plus a viewport cap stops a short
	 * window from letting her grow over the button below her.
	 */
	.stage-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		max-height: min(40vh, 400px);
		justify-self: center;
	}

	.controls {
		display: grid;
		justify-items: center;
		gap: 9px;
		text-align: center;
	}

	.deck {
		border-top: 1px solid var(--line);
		padding-top: 16px;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	/* ------------------------------------------------------------ work col */

	.work-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}

	.pane {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/*
	 * A readable measure even on a very wide screen. The column may be 900px;
	 * a paragraph should not be.
	 */
	.pane :global(.thread),
	.opening,
	.composer-slot,
	.rail {
		width: 100%;
		max-width: 78ch;
	}

	.pane :global(.scroller) {
		padding-top: 4px;
	}

	.opening {
		flex: 1;
		display: grid;
		align-content: start;
		gap: 10px;
		padding-top: clamp(8px, 6vh, 64px);
	}

	.opening h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(30px, 3.1vw, 46px);
		font-weight: 600;
		font-optical-sizing: auto;
		letter-spacing: -0.02em;
		line-height: 1.04;
	}

	.opening p {
		margin: 0;
		max-width: 54ch;
		font-size: clamp(14.5px, 1.05vw, 16.5px);
		line-height: 1.6;
		color: var(--ink-soft);
	}

	.starters {
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
		display: grid;
		gap: 12px;
		max-width: 78ch;
	}

	/* Equal heights: four cards of different lengths should still be one block. */
	.starters li {
		display: flex;
	}

	/*
	 * Two across as soon as there is room. One column of four reads as a menu;
	 * a 2×2 block reads as a set of things the app does, which is what it is.
	 */
	@media (min-width: 620px) {
		.starters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.samples {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 14px;
		margin: 16px 0 0;
		max-width: 78ch;
		font-size: 13px;
		color: var(--muted);
	}

	.samples button {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--accent);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.samples button:hover:not(:disabled) {
		text-decoration-color: currentColor;
	}

	.samples button:disabled {
		color: var(--muted);
		cursor: default;
	}

	/* ----------------------------------------------------------------- rail */

	.rail {
		flex: none;
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: none;
		mask-image: linear-gradient(to right, #000 92%, transparent);
	}

	.rail::-webkit-scrollbar {
		display: none;
	}

	.rail a {
		flex: none;
		font-size: 11.5px;
		font-weight: 640;
		font-variant-numeric: tabular-nums;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 4px 11px;
		text-decoration: none;
		white-space: nowrap;
	}

	.rail a:hover {
		background: color-mix(in srgb, var(--accent) 24%, var(--surface));
	}

	.composer-slot {
		flex: none;
	}

	/* ---------------------------------------------------------------- brief */

	/*
	 * The third column, and the answer to the dead space at 1920: past this
	 * width there is room for the deliverable to sit beside the conversation
	 * that produced it, so it does.
	 */
	@media (min-width: 1280px) {
		main {
			grid-template-columns: clamp(288px, 22vw, 400px) minmax(0, 1fr) clamp(280px, 22vw, 360px);
		}
	}

	.brief-col {
		display: flex;
		flex-direction: column;
		min-height: 0;
		/*
		 * No rule at all.
		 *
		 * A line down the page cuts it in two and fights the single wash the
		 * background is trying to be. The gap between the columns is enough to
		 * separate them.
		 */
		padding-left: clamp(16px, 1.6vw, 28px);
	}

	.pip {
		display: inline-grid;
		place-items: center;
		min-width: 17px;
		height: 17px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--paper);
		font-size: 10.5px;
		font-weight: 700;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 45;
		background: var(--scrim);
		backdrop-filter: blur(4px);
		animation: fade 200ms var(--ease) both;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	.brief-drawer {
		position: fixed;
		z-index: 46;
		inset: auto 0 0;
		max-height: min(76dvh, 640px);
		background: var(--paper);
		border-top: 1px solid var(--line);
		border-radius: 22px 22px 0 0;
		box-shadow: var(--shadow-float);
		padding-bottom: max(8px, env(safe-area-inset-bottom));
		animation: slide 280ms var(--ease) both;
	}

	@keyframes slide {
		from {
			transform: translateY(16px);
			opacity: 0;
		}
	}

	@media (min-width: 720px) {
		.brief-drawer {
			inset: 0 0 0 auto;
			width: min(420px, 92vw);
			max-height: none;
			border-radius: 22px 0 0 22px;
			border-top: 0;
			/*
		 * No rule at all.
		 *
		 * A line down the page cuts it in two and fights the single wash the
		 * background is trying to be. The gap between the columns is enough to
		 * separate them.
		 */
		}

		@keyframes slide {
			from {
				transform: translateX(20px);
				opacity: 0;
			}
		}
	}

	/* --------------------------------------------------------------- tablet */

	/* Below this the rail costs the transcript more than she is worth beside it. */
	@media (max-width: 860px) {
		main {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 10px;
			padding-bottom: max(10px, env(safe-area-inset-bottom));
		}

		.stage-col {
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-rows: none;
			grid-template-areas: 'robot controls';
			align-items: center;
			gap: clamp(12px, 4vw, 24px);
		}

		/*
		 * Big enough to read as a character rather than a favicon, small enough
		 * that the conversation still owns the screen.
		 */
		.stage-frame {
			grid-area: robot;
			width: clamp(132px, 34vw, 208px);
			max-height: none;
		}

		.controls {
			grid-area: controls;
			justify-items: start;
			text-align: left;
			gap: 7px;
		}

		.deck {
			display: none;
		}

		.opening {
			padding-top: 2px;
		}

		.opening h2 {
			font-size: clamp(25px, 7vw, 32px);
		}
	}

	/* A short phone in landscape has no room for a character at all. */
	@media (max-width: 860px) and (max-height: 560px) {
		.stage-frame {
			width: 108px;
		}
	}

	@media (max-width: 420px) {
		.bar-button:not(.icon-only) span {
			display: none;
		}

		.bar-button:not(.icon-only) {
			width: 34px;
			padding: 0;
			justify-content: center;
		}
	}
</style>
