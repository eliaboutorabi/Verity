/**
 * Where she looks when the pointer is a long way off.
 *
 * A pure function, so it runs in Node: the bug it pins is that a clamp
 * saturates. Past about one canvas away she hit the limit and stopped
 * responding, which is what "she loses track of my cursor" actually looked
 * like — she had not lost it, she had simply stopped moving.
 */

import { describe, expect, it } from 'vitest';
import { followRotation } from './dragControls.js';

const stage = { left: 100, top: 100, width: 300, height: 300 };

describe('followRotation', () => {
	it('looks straight ahead at its own centre', () => {
		const { pitch, yaw } = followRotation(stage, 250, 250);
		expect(pitch).toBeCloseTo(0, 6);
		expect(yaw).toBeCloseTo(0, 6);
	});

	it('keeps answering the pointer far outside the stage', () => {
		const near = followRotation(stage, 250, 700);
		const far = followRotation(stage, 250, 1400);

		// Both look down, and the further one looks further down. A clamp gives
		// the same answer to both.
		expect(near.pitch).toBeGreaterThan(0);
		expect(far.pitch).toBeGreaterThan(near.pitch);
	});

	it('never exceeds the range it was given, however far the pointer goes', () => {
		const { pitch, yaw } = followRotation(stage, 90_000, 90_000, {
			maxPitch: 0.2,
			maxYaw: 0.4
		});
		// tanh reaches 1 in float64 long before this, so the guarantee is that it
		// approaches the range and never overshoots it.
		expect(pitch).toBeLessThanOrEqual(0.2);
		expect(yaw).toBeLessThanOrEqual(0.4);

		// And at a distance a real pointer reaches, she is still short of it,
		// which is what leaves her room to keep responding.
		expect(followRotation(stage, 250, 1400, { maxPitch: 0.2 }).pitch).toBeLessThan(0.2);
	});

	it('reads screen-down as look-down and screen-right as look-right', () => {
		expect(followRotation(stage, 250, 400).pitch).toBeGreaterThan(0);
		expect(followRotation(stage, 250, 10).pitch).toBeLessThan(0);
		expect(followRotation(stage, 400, 250).yaw).toBeGreaterThan(0);
		expect(followRotation(stage, 10, 250).yaw).toBeLessThan(0);
	});
});
