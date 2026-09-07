<script lang="ts">
	/**
	 * The voice controls.
	 *
	 * Two round buttons when nothing is running, three when something is.
	 *
	 * The two are the two separate wants. **Talk** is a conversation: she hears
	 * the room and answers. **Listen** is not — it is the same session with the
	 * microphone off, for someone who would rather hear an answer than read one
	 * and has no intention of speaking. Before this the only way to get her
	 * voice was to open a microphone, which is a trade nobody should have to
	 * make to hear a paragraph read out.
	 *
	 * The three are mute, transcript and end. Transcript is off by default: a
	 * spoken conversation writes itself into the thread as it goes, and the
	 * scrolling drags the screen out from under whatever she has just put on it.
	 * The cards stay either way — those are the times she has something to show.
	 *
	 * State lives in the caption rather than in the labels, so the buttons keep
	 * their size and their place whatever she is doing.
	 */
	import {
		CallEnd01Icon,
		CaptionsIcon,
		CaptionsOffIcon,
		HeadphonesIcon,
		Mic01Icon,
		MicOff01Icon
	} from '@hugeicons/core-free-icons';
	import Icon from './Icon.svelte';
	import type { VoiceStatus } from '$lib/client/voice';

	interface Props {
		status: VoiceStatus;
		active: boolean;
		muted?: boolean;
		transcript?: boolean;
		/** Her own output level, for the ring that breathes while she talks. */
		level?: number;
		disabled?: boolean;
		/** Reason she cannot be started, shown in place of the state. */
		unavailable?: string;
		onstart: () => void;
		onlisten: () => void;
		onend: () => void;
		onmute: () => void;
		ontranscript: () => void;
	}

	let {
		status,
		active,
		muted = false,
		transcript = false,
		level = 0,
		disabled = false,
		unavailable,
		onstart,
		onlisten,
		onend,
		onmute,
		ontranscript
	}: Props = $props();

	const caption = $derived(
		unavailable
			? unavailable
			: !active
				? 'Talk, or just listen'
				: muted
					? 'Listening only — she cannot hear you'
					: status === 'connecting'
						? 'Connecting…'
						: status === 'thinking'
							? 'Thinking'
							: status === 'speaking'
								? 'Speaking — interrupting is fine'
								: 'Listening'
	);

	const ring = $derived(status === 'speaking' && !muted ? 1 + level * 0.55 : 1);
</script>

<div class="controls" data-status={muted ? 'muted' : status}>
	<div class="buttons">
		{#if active}
			<button
				class="round"
				class:on={muted}
				type="button"
				onclick={onmute}
				aria-pressed={muted}
				aria-label={muted ? 'Let her hear you again' : 'Stop her hearing you'}
				title={muted ? 'Unmute' : 'Mute'}
			>
				<Icon icon={muted ? MicOff01Icon : Mic01Icon} size={19} />
			</button>
			<button
				class="round"
				class:lit={transcript}
				type="button"
				onclick={ontranscript}
				aria-pressed={transcript}
				aria-label={transcript ? 'Hide the running transcript' : 'Show the running transcript'}
				title={transcript ? 'Hide the transcript' : 'Show the transcript'}
			>
				<Icon icon={transcript ? CaptionsIcon : CaptionsOffIcon} size={19} />
			</button>
			<button class="round end" type="button" onclick={onend} aria-label="End the voice conversation">
				<Icon icon={CallEnd01Icon} size={19} />
			</button>
		{:else}
			<button
				class="round primary"
				type="button"
				onclick={onstart}
				{disabled}
				aria-label="Start a voice conversation"
				title="Talk to her"
			>
				<span class="halo" aria-hidden="true" style="--ring: {ring}"></span>
				<Icon icon={Mic01Icon} size={21} />
			</button>
			<button
				class="round"
				type="button"
				onclick={onlisten}
				{disabled}
				aria-label="Listen without speaking"
				title="Listen — your microphone stays off"
			>
				<Icon icon={HeadphonesIcon} size={19} />
			</button>
		{/if}
	</div>

	<p class="caption" aria-live="polite">{caption}</p>
</div>

<style>
	.controls {
		display: grid;
		justify-items: center;
		gap: 9px;
	}

	.buttons {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.round {
		position: relative;
		display: grid;
		place-items: center;
		width: 46px;
		height: 46px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-soft);
		cursor: pointer;
		transition:
			transform 180ms var(--ease),
			background 200ms var(--ease),
			color 200ms var(--ease),
			border-color 200ms var(--ease);
	}

	.round:hover:not(:disabled),
	.round:focus-visible {
		transform: translateY(-1px);
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line-strong));
		color: var(--ink);
	}

	.round:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.primary {
		width: 54px;
		height: 54px;
		border-color: transparent;
		background: var(--cta);
		color: var(--cta-ink);
	}

	.primary:hover:not(:disabled) {
		background: var(--accent);
		color: white;
	}

	/* Muted is a state you must be able to see at a glance, not read. */
	.round.on {
		background: color-mix(in srgb, var(--severity-high) 18%, var(--surface));
		border-color: color-mix(in srgb, var(--severity-high) 55%, transparent);
		color: var(--severity-high);
	}

	.round.lit {
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 50%, transparent);
		color: var(--accent);
	}

	.end:hover {
		background: color-mix(in srgb, var(--severity-high) 16%, var(--surface));
		border-color: color-mix(in srgb, var(--severity-high) 50%, transparent);
		color: var(--severity-high);
	}

	/* Breathes with her own voice, so the button is alive while she speaks. */
	.halo {
		position: absolute;
		inset: -7px;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		transform: scale(var(--ring, 1));
		opacity: 0;
		transition: opacity 260ms var(--ease);
		pointer-events: none;
	}

	.controls[data-status='speaking'] .halo,
	.controls[data-status='listening'] .halo {
		opacity: 1;
	}

	.caption {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.35;
		color: var(--muted);
		text-align: center;
		max-width: 26ch;
	}

	.controls[data-status='muted'] .caption {
		color: var(--severity-high);
	}
</style>
