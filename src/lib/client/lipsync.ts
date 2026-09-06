/**
 * What her mouth should be doing, from the sound she is making.
 *
 * The old mouth was one number. An RMS envelope scaled a fixed smile, so
 * "cheese" and "who" moved her lips identically and everything read as a
 * flapping hinge. This works the way speech actually does.
 *
 * The vowel a person is making is carried by the first two formants — the
 * resonances of the vocal tract — and they map almost embarrassingly directly
 * onto the two things a mouth visibly does. F1 tracks how far the jaw is open:
 * around 300 Hz for the nearly-shut "ee" and "oo", around 730 Hz for a wide
 * "ah". F2 tracks front-to-back, which is visible as spreading versus
 * rounding: about 2300 Hz for the wide "ee" and under 900 Hz for the pursed
 * "oo". Two numbers in, two numbers out, continuous the whole way — so there
 * is nothing to pop between, unlike a classifier picking one of fifteen
 * visemes a frame.
 *
 * On top of that sits the one consonant shape that is honestly legible from a
 * cheap spectrum: the narrow slit of a sibilant, which is the only thing in
 * speech with most of its energy above 4 kHz. A lip closure is not. Measuring
 * synthesised /m/ against ordinary speech (see the calibration note below) the
 * nasal-murmur cue everyone reaches for — nearly all the energy under 500 Hz —
 * sits at 0.99 for a held "mmm" and 0.96 for a sentence with no /m/ in it,
 * because a voice's fundamental dominates that band whatever the lips are
 * doing. So `press` is left to the text driver, which knows the letters and
 * does not have to guess.
 *
 * Levels are judged against her own recent speech rather than against fixed
 * thresholds, which is JALI's observation: what matters for how far a jaw
 * drops is whether this syllable is loud *for this speaker*, not its absolute
 * amplitude. A quiet passage keeps its shape instead of flattening out.
 */

/** Where the mouth is, as four independent things it can be doing at once. */
export interface MouthPose {
	/** Aperture, 0 shut to 1 wide. */
	open: number;
	/** 0 spread wide, 1 pursed small. */
	round: number;
	/**
	 * Lips pressed together: /m/, /b/, /p/.
	 *
	 * Set from text, never from sound — see the note at the top. The voice
	 * driver leaves it at zero and lets the closure itself do the work: a /b/
	 * really is a silence, and silence already shuts her mouth.
	 */
	press: number;
	/** The narrow slit of a sibilant or a fricative. */
	hiss: number;
	/** How loud she is, relative to her own recent speech. */
	energy: number;
}

export const MOUTH_AT_REST: MouthPose = Object.freeze({
	open: 0,
	round: 0,
	press: 0,
	hiss: 0,
	energy: 0
});

/**
 * Bands, in Hz.
 *
 * F1 and F2 are found as the energy-weighted centre of a band rather than by
 * picking a peak. Peak-picking on a 23 Hz-resolution FFT of a voice with a
 * 200 Hz fundamental finds harmonics, not formants, and jitters between them
 * frame to frame; a centroid moves smoothly and lands where the resonance is
 * pulling the energy, which is the only thing we need it for.
 */
const F1_BAND = { low: 220, high: 1050 };
const F2_BAND = { low: 1050, high: 2900 };
/** Sibilants and fricatives live up here and almost nothing else does. */
const HISS_BAND = { low: 3800, high: 9000 };

export interface SpectralFeatures {
	/** Energy-weighted centre of the F1 band, in Hz. */
	f1: number;
	/** Energy-weighted centre of the F2 band, in Hz. */
	f2: number;
	/** Share of the total that is up in the fricative band, 0..1. */
	hiss: number;
	/** Broadband level, linear. */
	loudness: number;
}

export const SILENT_FEATURES: SpectralFeatures = Object.freeze({
	f1: 0,
	f2: 0,
	hiss: 0,
	loudness: 0
});

/**
 * Read the features out of one magnitude spectrum.
 *
 * A pure function of an array and a bin width, deliberately: the browser gets
 * its spectrum from an `AnalyserNode` and the tests get theirs from an FFT of
 * a synthesised vowel, and both have to be measuring the same thing for the
 * tests to be worth anything.
 */
export function spectralFeatures(magnitudes: ArrayLike<number>, binHz: number): SpectralFeatures {
	if (!binHz) return SILENT_FEATURES;

	let total = 0;
	let hiss = 0;
	let f1Weight = 0;
	let f1Sum = 0;
	let f2Weight = 0;
	let f2Sum = 0;

	for (let bin = 1; bin < magnitudes.length; bin += 1) {
		const hz = bin * binHz;
		if (hz > 10_000) break;
		// Squared, so a resonance outweighs the hash around it rather than
		// merely outnumbering it.
		const power = magnitudes[bin] * magnitudes[bin];
		total += power;

		if (hz >= HISS_BAND.low && hz < HISS_BAND.high) hiss += power;
		if (hz >= F1_BAND.low && hz < F1_BAND.high) {
			f1Weight += power;
			f1Sum += power * hz;
		}
		if (hz >= F2_BAND.low && hz < F2_BAND.high) {
			f2Weight += power;
			f2Sum += power * hz;
		}
	}

	if (total <= 0) return SILENT_FEATURES;

	return {
		// With no energy in a band, sit in the middle of it rather than at zero:
		// a centroid of 0 Hz would read as an impossibly closed mouth.
		f1: f1Weight > 0 ? f1Sum / f1Weight : (F1_BAND.low + F1_BAND.high) / 2,
		f2: f2Weight > 0 ? f2Sum / f2Weight : (F2_BAND.low + F2_BAND.high) / 2,
		hiss: hiss / total,
		loudness: Math.sqrt(total)
	};
}

/*
 * Calibration.
 *
 * These are the observed range of the *centroids*, not the textbook range of
 * the formants themselves: a centroid taken over a band is pulled toward the
 * middle of that band, so the span it covers is a good deal narrower than the
 * 300–730 Hz a vowel chart gives for F1.
 *
 * Measured, not guessed. Six sentences were synthesised and run through this
 * function frame by frame — one loaded with "ee", one with "ah", one with
 * "oo", one with sibilants, one with bilabials, and one of ordinary speech.
 * Median F1 centroid came out at 328 Hz for the "ee" sentence, 366 for "oo"
 * and 612 for "ah"; median F2 at 2390, 1443 and 1273 respectively. The
 * constants below bracket those, and lipsync.spec.ts pins the orderings they
 * encode so a later edit cannot quietly invert them.
 */
const F1_SHUT = 305;
const F1_WIDE = 545;
const F2_ROUND = 1350;
const F2_SPREAD = 2150;

function clamp(value: number, low = 0, high = 1): number {
	return value < low ? low : value > high ? high : value;
}

/** 0 below `low`, 1 above `high`, linear between. */
function ramp(value: number, low: number, high: number): number {
	return clamp((value - low) / (high - low));
}

/** Softens a 0..1 ramp at both ends, so nothing arrives or leaves with a corner. */
function ease(value: number): number {
	return value * value * (3 - 2 * value);
}

/**
 * How loud is this, for her?
 *
 * Keeps a decaying mean and deviation of the levels she has actually been
 * speaking at, so a whisper still opens her mouth and a shout does not peg it.
 * Silence is excluded from the statistics — averaging in the gaps would drag
 * the mean toward zero and make every syllable look like a shout.
 */
class Loudness {
	#mean = 0;
	#variance = 0;
	#seen = false;

	/** Absolute floor. Below this nobody is talking, whatever the statistics say. */
	static readonly FLOOR = 0.0025;

	observe(level: number, deltaTime: number): number {
		if (level < Loudness.FLOOR) return 0;

		if (!this.#seen) {
			this.#mean = level;
			this.#variance = (level * 0.5) ** 2;
			this.#seen = true;
		} else {
			// A ~1.5 s window: long enough to average a phrase, short enough to
			// follow her changing register within one.
			const rate = 1 - Math.exp(-deltaTime / 1.5);
			const error = level - this.#mean;
			this.#mean += error * rate;
			this.#variance += (error * error - this.#variance) * rate;
		}

		const deviation = Math.sqrt(Math.max(this.#variance, 1e-9));
		return clamp(0.5 + (level - this.#mean) / (3 * deviation));
	}

	reset(): void {
		this.#seen = false;
		this.#mean = 0;
		this.#variance = 0;
	}
}

/**
 * Per-channel damping, with a different rate each way.
 *
 * A jaw drops faster than it closes, lips round slowly, and a closure has to
 * be crisp at both ends or the /b/ in "about" turns into a mumble. One damping
 * constant for the whole face is what makes procedural lip sync look rubbery.
 */
interface Rates {
	attack: number;
	release: number;
}

const RATES: Record<keyof MouthPose, Rates> = {
	open: { attack: 24, release: 11 },
	round: { attack: 13, release: 10 },
	press: { attack: 38, release: 26 },
	hiss: { attack: 26, release: 15 },
	energy: { attack: 20, release: 9 }
};

function damp(current: number, target: number, rates: Rates, deltaTime: number): number {
	const rate = target > current ? rates.attack : rates.release;
	return current + (target - current) * (1 - Math.exp(-rate * deltaTime));
}

/**
 * Turns a stream of spectra into a mouth.
 *
 * Kept separate from where the spectrum comes from, so the same driver serves
 * the live voice session and any test that can produce a spectrum.
 */
export class MouthDriver {
	#pose: MouthPose = { ...MOUTH_AT_REST };
	#loudness = new Loudness();

	get pose(): MouthPose {
		return this.#pose;
	}

	/** Advance one frame. Returns the pose, which is also kept as `pose`. */
	push(features: SpectralFeatures, deltaTime: number): MouthPose {
		const step = clamp(deltaTime, 0, 0.1);
		const energy = this.#loudness.observe(features.loudness, step);
		const target = energy > 0 ? shapeOf(features, energy) : MOUTH_AT_REST;

		for (const channel of Object.keys(RATES) as (keyof MouthPose)[]) {
			this.#pose[channel] = damp(this.#pose[channel], target[channel], RATES[channel], step);
		}
		this.#pose.energy = damp(this.#pose.energy, energy, RATES.energy, step);
		return this.#pose;
	}

	/** She stopped talking; forget what loud meant for the last thing she said. */
	reset(): void {
		this.#pose = { ...MOUTH_AT_REST };
		this.#loudness.reset();
	}
}

/** The mouth one frame of sound asks for, before any smoothing. */
export function shapeOf(features: SpectralFeatures, energy: number): MouthPose {
	const hiss = ease(ramp(features.hiss, 0.16, 0.5));

	// F1 says how far the jaw is down; loudness says how committed she is about
	// it. A loud "ee" is still a narrow mouth, so this scales rather than adds.
	const aperture = ease(ramp(features.f1, F1_SHUT, F1_WIDE));
	const open = aperture * (0.55 + 0.45 * energy) * (1 - hiss * 0.88);

	/*
	 * Rounding is back *and* closed, not back alone.
	 *
	 * Low F2 only says the tongue is back, and "ah" is as back as "oo" — 1273
	 * against 1443 Hz in the measurements — while being the widest, least
	 * pursed shape there is. What separates them is the jaw: /u/ is back and
	 * shut, /ɑ/ is back and open. Multiplying by the closed-ness is the whole
	 * fix, and it is why she does not purse her lips through "car park".
	 */
	const back = 1 - ease(ramp(features.f2, F2_ROUND, F2_SPREAD));
	const round = clamp(back * (1 - aperture) * (1 - hiss * 0.45));

	return { open, round, press: 0, hiss, energy };
}

/**
 * The live session's mouth: an `AnalyserNode` in, a pose out, once a frame.
 *
 * The analyser does no smoothing of its own. Its `smoothingTimeConstant` is a
 * blur across time applied before we ever see the numbers, and it is exactly
 * the wrong tool here: it rounds off the closures and bursts that carry most
 * of the legibility. All the smoothing this needs happens per channel, after
 * the shape has been worked out.
 */
export class VoiceMouth {
	readonly #analyser: AnalyserNode;
	readonly #spectrum: Float32Array<ArrayBuffer>;
	readonly #waveform: Float32Array<ArrayBuffer>;
	readonly #binHz: number;
	readonly #driver = new MouthDriver();

	constructor(context: AudioContext, source: AudioNode) {
		const analyser = context.createAnalyser();
		// 2048 at 48 kHz is a 23 Hz bin and a 43 ms window: fine enough to place
		// a formant, short enough that a plosive is still an event.
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0;
		analyser.minDecibels = -96;
		source.connect(analyser);

		this.#analyser = analyser;
		this.#spectrum = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
		this.#waveform = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
		this.#binHz = context.sampleRate / analyser.fftSize;
	}

	/** Read the current frame. Returns the pose and the raw level beside it. */
	read(deltaTime: number): { pose: MouthPose; level: number } {
		this.#analyser.getFloatFrequencyData(this.#spectrum);

		// dB back to linear. Anything at the floor contributed nothing.
		const magnitudes = this.#spectrum;
		for (let bin = 0; bin < magnitudes.length; bin += 1) {
			magnitudes[bin] = magnitudes[bin] <= -95 ? 0 : 10 ** (magnitudes[bin] / 20);
		}

		const features = spectralFeatures(magnitudes, this.#binHz);
		const pose = this.#driver.push(features, deltaTime);
		return { pose, level: this.level() };
	}

	/**
	 * Plain broadband level.
	 *
	 * Still measured in the time domain rather than taken from the spectrum:
	 * this one drives the paper feed and the "is she audible" gate, where what
	 * matters is amplitude and nothing else.
	 */
	level(): number {
		this.#analyser.getFloatTimeDomainData(this.#waveform);
		let sum = 0;
		for (const sample of this.#waveform) sum += sample * sample;
		return Math.sqrt(sum / this.#waveform.length);
	}

	reset(): void {
		this.#driver.reset();
	}

	disconnect(): void {
		this.#analyser.disconnect();
	}
}
