/**
 * The sound of a calculator key.
 *
 * Synthesised rather than sampled: four short clicks would be four network
 * requests and a licence question, and a key press is a noise burst through a
 * band-pass with a fast decay — which is a few lines and sounds right.
 *
 * Each key has its own pitch, so the keypad reads as an instrument rather than
 * one sound played four times. The equals key is the lowest and the most
 * satisfying, because it is the one people press.
 */

/** Centre frequency per key, in reading order: +, −, ×, =. */
const PITCH = [1180, 1040, 900, 660];

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** One short buffer of white noise, reused for every press. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
	if (noise && noise.sampleRate === ctx.sampleRate) return noise;
	const frames = Math.floor(ctx.sampleRate * 0.12);
	const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
	noise = buffer;
	return buffer;
}

/**
 * A browser will not start an AudioContext without a gesture, so the first
 * press both creates and resumes it. Later presses reuse it.
 */
function audio(): AudioContext | null {
	try {
		context ??= new AudioContext();
		if (context.state === 'suspended') void context.resume();
		return context;
	} catch {
		// No audio available. A silent key is better than a broken page.
		return null;
	}
}

export function playKey(index: number, volume = 0.5): void {
	const ctx = audio();
	if (!ctx) return;

	const now = ctx.currentTime;
	const pitch = PITCH[index] ?? 900;

	// The click: filtered noise, gone in a tenth of a second.
	const click = ctx.createBufferSource();
	click.buffer = noiseBuffer(ctx);

	const band = ctx.createBiquadFilter();
	band.type = 'bandpass';
	band.frequency.value = pitch;
	band.Q.value = 5.5;

	const clickGain = ctx.createGain();
	clickGain.gain.setValueAtTime(0.0001, now);
	clickGain.gain.exponentialRampToValueAtTime(volume * 0.55, now + 0.004);
	clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

	click.connect(band).connect(clickGain).connect(ctx.destination);
	click.start(now);
	click.stop(now + 0.13);

	// The body: a short sine under the click, which is what makes it feel like
	// a key with a mechanism rather than a tap on glass.
	const thump = ctx.createOscillator();
	thump.type = 'sine';
	thump.frequency.setValueAtTime(pitch * 0.42, now);
	thump.frequency.exponentialRampToValueAtTime(pitch * 0.3, now + 0.07);

	const thumpGain = ctx.createGain();
	thumpGain.gain.setValueAtTime(0.0001, now);
	thumpGain.gain.exponentialRampToValueAtTime(volume * 0.32, now + 0.006);
	thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

	thump.connect(thumpGain).connect(ctx.destination);
	thump.start(now);
	thump.stop(now + 0.14);
}

/** Release the audio context. Safe to call more than once. */
export function disposeKeySound(): void {
	void context?.close().catch(() => {});
	context = null;
	noise = null;
}
