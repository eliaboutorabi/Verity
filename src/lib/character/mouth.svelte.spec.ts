/**
 * The geometry her mouth actually ends up as.
 *
 * A browser test because it builds real three.js meshes. It measures the
 * vertices rather than looking at a picture, which is the only way to state
 * things like "the lips touch at rest" precisely enough to be worth asserting.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MOUTH_SHAPE_REST, VerityRobot, createVerityMouth } from './index.js';
import { TextMouth } from '$lib/client/mouth-from-text';

/*
 * The vertex layout, read from the mesh rather than restated here: two lips of
 * `along` columns each, and within a column `across` samples running from the
 * lip line outward. So j = 0 is the edge of the opening on either lip, and
 * column 0 and column along - 1 are the two corners.
 */
type Mouth = ReturnType<typeof createVerityMouth>;

function mouth() {
	return createVerityMouth(new THREE.MeshBasicMaterial());
}

const centreOf = (m: Mouth) => Math.floor(m.layout.along / 2);

/** One vertex, by lip, column along the mouth, and sample across the stroke. */
function at(m: Mouth, lip: 0 | 1, along: number, across: number) {
	const positions = m.object3d.geometry.getAttribute('position');
	const perLip = m.layout.along * m.layout.across;
	const index = lip * perLip + along * m.layout.across + across;
	return { x: positions.getX(index), y: positions.getY(index), z: positions.getZ(index) };
}

/** The opening at the middle of the mouth, and its corner-to-corner width. */
function lips(m: Mouth) {
	const centre = centreOf(m);
	return {
		gap: at(m, 0, centre, 0).y - at(m, 1, centre, 0).y,
		width: at(m, 0, m.layout.along - 1, 0).x - at(m, 0, 0, 0).x
	};
}

/** How far the mouth line dips below its own corners. */
function smileDepth(m: Mouth) {
	return at(m, 0, 0, 0).y - at(m, 0, centreOf(m), 0).y;
}

describe('the mouth', () => {
	it('is a closed smile at rest, exactly as it was before it could open', () => {
		const m = mouth();
		m.setShape(MOUTH_SHAPE_REST);

		// The two strokes meet edge to edge rather than overlapping — coincident
		// triangles would z-fight — and the result is one line, not a gap.
		expect(lips(m).gap).toBeCloseTo(0, 5);
		expect(smileDepth(m)).toBeGreaterThan(0.05);
	});

	it('opens a real gap as the jaw goes down', () => {
		const m = mouth();
		m.setShape({ open: 0 });
		const shut = lips(m).gap;
		m.setShape({ open: 1 });

		expect(lips(m).gap).toBeGreaterThan(shut + 0.2);
	});

	it('drops the lower lip further than it lifts the upper', () => {
		// Smile held flat, so this measures the aperture alone. Opening also
		// takes the grin back, which lifts the whole mouth line, and that is a
		// separate effect from which way the lips part.
		const m = mouth();
		const centre = centreOf(m);
		m.setShape({ open: 0, smile: 0 });
		const restY = at(m, 0, centre, 0).y;
		m.setShape({ open: 1, smile: 0 });

		const lifted = at(m, 0, centre, 0).y - restY;
		const dropped = restY - at(m, 1, centre, 0).y;

		// A jaw, not a pair of shutters: an evenly opening mouth reads as
		// surprise on every single syllable.
		expect(dropped).toBeGreaterThan(lifted * 1.5);
	});

	it('narrows when pursed and widens when spread', () => {
		const m = mouth();
		m.setShape({ round: 1, energy: 1 });
		const pursed = lips(m).width;
		m.setShape({ round: 0, energy: 1 });

		expect(pursed).toBeLessThan(lips(m).width * 0.75);
	});

	it('still parts for a pursed "oo", which barely opens the jaw', () => {
		const m = mouth();
		m.setShape({ open: 0.15, round: 0.9, energy: 0.7 });

		// Rounding has to carry its own aperture. Driven by `open` alone this
		// was a narrow smile rather than a mouth.
		expect(lips(m).gap).toBeGreaterThan(0.03);
	});

	it('flattens the smile when the lips are pressed', () => {
		const m = mouth();
		m.setShape({ press: 0 });
		const relaxed = smileDepth(m);
		m.setShape({ press: 1 });

		expect(smileDepth(m)).toBeLessThan(relaxed);
		expect(lips(m).gap).toBeCloseTo(0, 5);
	});

	it('reassembles into one round stroke when it is shut', () => {
		const m = mouth();
		const centre = centreOf(m);
		const outer = m.layout.across - 1;
		m.setShape(MOUTH_SHAPE_REST);

		// Each lip is fullest at the seam and flat at its outer edge, so closed
		// the pair is the round tube this replaced rather than two flat ribbons
		// with a crease down the middle.
		expect(at(m, 0, centre, 0).z).toBeGreaterThan(at(m, 0, centre, outer).z);
		expect(at(m, 0, centre, 0).z).toBeCloseTo(at(m, 1, centre, 0).z, 6);
		expect(at(m, 0, centre, outer).z).toBeCloseTo(0, 6);
	});

	it('faces the camera on both lips', () => {
		const m = mouth();
		m.setShape({ open: 0.7 });
		const normals = m.object3d.geometry.getAttribute('normal');
		const perLip = m.layout.along * m.layout.across;
		const column = centreOf(m) * m.layout.across;

		// Wound the wrong way, one lip lights from behind and reads heavier than
		// the other — which is exactly what it looked like.
		expect(normals.getZ(column + 1)).toBeGreaterThan(0.2);
		expect(normals.getZ(perLip + column + 1)).toBeGreaterThan(0.2);
	});

	it('turns the lower lip up into the light as it opens', () => {
		const m = mouth();
		const centre = centreOf(m);
		const outer = m.layout.across - 1;

		m.setShape({ open: 0 });
		// Closed, both crest at the seam: together they are one round tube.
		expect(at(m, 1, centre, 0).z).toBeGreaterThan(at(m, 1, centre, outer).z);

		m.setShape({ open: 1 });
		// Open, the lower lip's crest has travelled outward, which tilts its
		// face back toward a key light that comes from above.
		expect(at(m, 1, centre, outer).z).toBeGreaterThan(at(m, 1, centre, 0).z);
		// The upper lip never moves its crest; it is already facing the light.
		expect(at(m, 0, centre, 0).z).toBeGreaterThan(at(m, 0, centre, outer).z);
	});

	it('keeps the corners sealed, so the lips never come apart at the ends', () => {
		const m = mouth();
		m.setShape({ open: 1 });

		const centre = lips(m).gap;
		// One column in from the very end. A profile that only reaches zero at
		// the last sample snaps shut over a single segment, and the corner reads
		// as two lips that have come apart and been pinched back together.
		const nearCorner = at(m, 0, 1, 0).y - at(m, 1, 1, 0).y;

		expect(nearCorner).toBeLessThan(centre * 0.04);
		expect(at(m, 0, 0, 0).y).toBeCloseTo(at(m, 1, 0, 0).y, 6);
	});

	it('produces finite geometry for every corner of the space', () => {
		const m = mouth();
		for (const open of [0, 1]) {
			for (const round of [0, 1]) {
				for (const press of [0, 1]) {
					for (const hiss of [0, 1]) {
						m.setShape({ open, round, press, hiss, energy: 1 });
						const positions = m.object3d.geometry.getAttribute('position');
						for (let i = 0; i < positions.count * 3; i += 1) {
							expect(Number.isFinite(positions.array[i])).toBe(true);
						}
					}
				}
			}
		}
	});
});

describe('printing an answer', () => {
	it('moves her mouth from the paper, at the paper\'s own pace', () => {
		const robot = new VerityRobot();
		const typing = new TextMouth();
		robot.setOutputAudioActive(true);
		robot.appendTranscript('A business meal must be ordinary and necessary.');

		const opens: number[] = [];
		let printed = '';
		for (let frame = 0; frame < 120; frame += 1) {
			robot.update(frame / 60, 1 / 60);
			printed += robot.justPrinted;
			opens.push(typing.push(robot.justPrinted, 1 / 60).open);
		}

		// The print head, not the network: the delta arrived in one lump and the
		// paper is still laying it down a couple of dozen characters a second.
		expect(printed.length).toBeGreaterThan(20);
		expect(printed.length).toBeLessThan(60);
		expect(printed.startsWith('A business')).toBe(true);

		// And her mouth actually moved, rather than sitting at one value.
		const span = Math.max(...opens) - Math.min(...opens);
		expect(span).toBeGreaterThan(0.2);
		robot.dispose();
	});
});
