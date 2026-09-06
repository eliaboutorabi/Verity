/**
 * Her mouth while she is typing rather than talking.
 *
 * Text mode has no audio to analyse, and what was here before said so: a pair
 * of detuned sines opened and shut her lips at a fixed wobble whatever the
 * words were. It looked like a machine idling, because that is what it was.
 *
 * But text mode has something the voice session does not — it *is* the clock.
 * The receipt prints one character at a time at a rate we choose, so there is
 * no alignment problem to solve: the letter under the print head is, by
 * construction, the letter she is saying. Read the shape straight off it and
 * her mouth says what the paper says.
 *
 * English spelling is a poor guide to English sound, and this makes no attempt
 * to fix that. It does not need to. Nobody watching can tell whether the "ea"
 * in "meal" got the right vowel; they can tell instantly whether her lips shut
 * on the /m/ and spread on the "ee", and letters are enough for that.
 */

import type { MouthPose } from './lipsync';

interface Shape {
	open: number;
	round: number;
	press: number;
	hiss: number;
}

/**
 * Letter to mouth.
 *
 * The vowels come from the same two axes the voice analyser uses, so both
 * drivers are aiming at the same shapes: "a" wide, "e" spread, "o" and "u"
 * pursed. The consonants are the three that read from across a room — lips
 * together, teeth on lip, and the slit of a sibilant — and everything else is
 * a small neutral parting, which is what most of the mouth is doing most of
 * the time anyway.
 */
const SHAPES: Record<string, Shape> = {
	a: { open: 0.86, round: 0.06, press: 0, hiss: 0 },
	e: { open: 0.44, round: 0, press: 0, hiss: 0 },
	i: { open: 0.3, round: 0.02, press: 0, hiss: 0 },
	o: { open: 0.58, round: 0.78, press: 0, hiss: 0 },
	u: { open: 0.32, round: 0.92, press: 0, hiss: 0 },
	y: { open: 0.3, round: 0.12, press: 0, hiss: 0 },

	m: { open: 0, round: 0.12, press: 1, hiss: 0 },
	b: { open: 0.08, round: 0.06, press: 0.92, hiss: 0 },
	p: { open: 0.08, round: 0.06, press: 0.92, hiss: 0 },

	f: { open: 0.14, round: 0.1, press: 0.34, hiss: 0.52 },
	v: { open: 0.14, round: 0.1, press: 0.34, hiss: 0.46 },

	s: { open: 0.14, round: 0.08, press: 0, hiss: 0.9 },
	z: { open: 0.14, round: 0.08, press: 0, hiss: 0.82 },
	c: { open: 0.18, round: 0.08, press: 0, hiss: 0.6 },
	x: { open: 0.2, round: 0.06, press: 0, hiss: 0.7 },
	h: { open: 0.26, round: 0.06, press: 0, hiss: 0.4 },
	j: { open: 0.22, round: 0.34, press: 0, hiss: 0.55 },

	w: { open: 0.24, round: 0.88, press: 0, hiss: 0 },
	r: { open: 0.3, round: 0.5, press: 0, hiss: 0.08 },
	l: { open: 0.34, round: 0.06, press: 0, hiss: 0 },
	q: { open: 0.24, round: 0.86, press: 0, hiss: 0.2 }
};

/** Anything with a letter but no entry: a small, unremarkable parting. */
const DEFAULT_CONSONANT: Shape = { open: 0.24, round: 0.08, press: 0, hiss: 0.06 };
const CLOSED: Shape = { open: 0, round: 0, press: 0, hiss: 0 };

/** The shape a single character asks for, or null for a space or a mark. */
export function shapeOfLetter(character: string): Shape | null {
	const letter = character.toLowerCase();
	if (!/[a-z]/.test(letter)) return null;
	return SHAPES[letter] ?? DEFAULT_CONSONANT;
}

/*
 * A held letter is a mouth that has stopped, so each one gets a little life of
 * its own: it arrives, holds, and gives way. `weightAt` is the crude dominance
 * curve that does it — the same idea as the overlapping dominance functions
 * procedural lip sync has used since Cohen and Massaro, without pretending to
 * be more than a rise and a fall.
 */
const HOLD = 0.075;
const FALL = 0.13;

function weightAt(age: number): number {
	if (age < 0) return 0;
	if (age < HOLD) return 1;
	const away = (age - HOLD) / FALL;
	return away >= 1 ? 0 : (1 - away) * (1 - away);
}

/**
 * Reads what has just been printed and hands back a pose.
 *
 * Fed the characters that arrived this frame rather than the whole transcript,
 * because the whole transcript is a rolling window and would silently stop
 * growing. Several characters in one frame are laid out across that frame, so
 * her rate stays honest to how fast the paper is actually moving.
 */
export class TextMouth {
	/** Letters still fading, most recent last. */
	#recent: { shape: Shape; age: number }[] = [];
	#pose: MouthPose = { open: 0, round: 0, press: 0, hiss: 0, energy: 0 };

	/**
	 * @param arrived Characters printed since the last call; '' for a quiet frame.
	 * @param deltaTime Seconds since the last call.
	 */
	push(arrived: string, deltaTime: number): MouthPose {
		const step = Math.min(Math.max(deltaTime, 0), 0.1);

		// Spread this frame's characters across the frame, so a burst of ten
		// reads as ten quick shapes rather than one loud one.
		const spacing = arrived.length > 1 ? step / arrived.length : 0;
		for (let index = 0; index < arrived.length; index += 1) {
			const shape = shapeOfLetter(arrived[index]);
			// A space is a real event: it closes her mouth, which is what makes
			// the gaps between words visible.
			this.#recent.push({
				shape: shape ?? CLOSED,
				age: -spacing * (arrived.length - 1 - index)
			});
		}

		for (const entry of this.#recent) entry.age += step;
		this.#recent = this.#recent.filter((entry) => entry.age < HOLD + FALL);

		/*
		 * Blend what is still sounding. A weighted mean rather than the last
		 * letter outright, so "st" is a mouth on its way from one shape to the
		 * next instead of two frames of jump.
		 */
		let weight = 0;
		const blend: Shape = { open: 0, round: 0, press: 0, hiss: 0 };
		for (const entry of this.#recent) {
			const w = weightAt(entry.age);
			if (w <= 0) continue;
			weight += w;
			blend.open += entry.shape.open * w;
			blend.round += entry.shape.round * w;
			blend.press += entry.shape.press * w;
			blend.hiss += entry.shape.hiss * w;
		}

		const target: MouthPose =
			weight > 0
				? {
						open: blend.open / weight,
						round: blend.round / weight,
						press: blend.press / weight,
						hiss: blend.hiss / weight,
						energy: Math.min(1, weight)
					}
				: { open: 0, round: 0, press: 0, hiss: 0, energy: 0 };

		// One more pass of damping, so the seam between two letters is a move
		// and not a step.
		const chase = 1 - Math.exp(-26 * step);
		for (const channel of ['open', 'round', 'press', 'hiss', 'energy'] as const) {
			this.#pose[channel] += (target[channel] - this.#pose[channel]) * chase;
		}
		return this.#pose;
	}

	/** Start again on a new answer. */
	reset(): void {
		this.#recent = [];
		this.#pose = { open: 0, round: 0, press: 0, hiss: 0, energy: 0 };
	}
}
