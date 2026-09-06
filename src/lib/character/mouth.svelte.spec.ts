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

function mouth() {
	return createVerityMouth(new THREE.MeshBasicMaterial());
}

/*
 * The vertex layout, which these measurements have to know.
 *
 * Two lips of ALONG columns each; within a column, ACROSS samples running from
 * the lip line outward. So j = 0 is the edge of the opening on either lip, and
 * column 0 and column ALONG - 1 are the two corners.
 */
const ALONG = 30;
const ACROSS = 5;
const PER_LIP = ALONG * ACROSS;
const CENTRE = Math.floor(ALONG / 2);

/** One vertex, by lip, column along the mouth, and sample across the stroke. */
function at(object: THREE.Mesh, lip: 0 | 1, along: number, across: number) {
	const positions = object.geometry.getAttribute('position');
	const index = lip * PER_LIP + along * ACROSS + across;
	return { x: positions.getX(index), y: positions.getY(index), z: positions.getZ(index) };
}

/** The opening at the middle of the mouth, and its corner-to-corner width. */
function lips(object: THREE.Mesh) {
	return {
		gap: at(object, 0, CENTRE, 0).y - at(object, 1, CENTRE, 0).y,
		width: at(object, 0, ALONG - 1, 0).x - at(object, 0, 0, 0).x
	};
}

/** How far the mouth line dips below its own corners. */
function smileDepth(object: THREE.Mesh) {
	return at(object, 0, 0, 0).y - at(object, 0, CENTRE, 0).y;
}

describe('the mouth', () => {
	it('is a closed smile at rest, exactly as it was before it could open', () => {
		const { object3d, setShape } = mouth();
		setShape(MOUTH_SHAPE_REST);

		// The two strokes meet edge to edge rather than overlapping — coincident
		// triangles would z-fight — and the result is one line, not a gap.
		expect(lips(object3d).gap).toBeCloseTo(0, 5);
		expect(smileDepth(object3d)).toBeGreaterThan(0.05);
	});

	it('opens a real gap as the jaw goes down', () => {
		const { object3d, setShape } = mouth();
		setShape({ open: 0 });
		const shut = lips(object3d).gap;
		setShape({ open: 1 });
		const wide = lips(object3d).gap;

		expect(wide).toBeGreaterThan(shut + 0.2);
	});

	it('drops the lower lip further than it lifts the upper', () => {
		// Smile held flat, so this measures the aperture alone. Opening also
		// takes the grin back, which lifts the whole mouth line, and that is a
		// separate effect from which way the lips part.
		const { object3d, setShape } = mouth();
		setShape({ open: 0, smile: 0 });
		const restY = at(object3d, 0, CENTRE, 0).y;
		setShape({ open: 1, smile: 0 });

		const lifted = at(object3d, 0, CENTRE, 0).y - restY;
		const dropped = restY - at(object3d, 1, CENTRE, 0).y;

		// A jaw, not a pair of shutters: an evenly opening mouth reads as
		// surprise on every single syllable.
		expect(dropped).toBeGreaterThan(lifted * 1.5);
	});

	it('narrows when pursed and widens when spread', () => {
		const { object3d, setShape } = mouth();
		setShape({ round: 1, energy: 1 });
		const pursed = lips(object3d).width;
		setShape({ round: 0, energy: 1 });
		const spread = lips(object3d).width;

		expect(pursed).toBeLessThan(spread * 0.75);
	});

	it('still parts for a pursed "oo", which barely opens the jaw', () => {
		const { object3d, setShape } = mouth();
		setShape({ open: 0.15, round: 0.9, energy: 0.7 });

		// Rounding has to carry its own aperture. Driven by `open` alone this
		// was a narrow smile rather than a mouth.
		expect(lips(object3d).gap).toBeGreaterThan(0.03);
	});

	it('flattens the smile when the lips are pressed', () => {
		const { object3d, setShape } = mouth();
		setShape({ press: 0 });
		const relaxed = smileDepth(object3d);
		setShape({ press: 1 });

		expect(smileDepth(object3d)).toBeLessThan(relaxed);
		expect(lips(object3d).gap).toBeCloseTo(0, 5);
	});

	it('reassembles into one round stroke when it is shut', () => {
		const { object3d, setShape } = mouth();
		setShape(MOUTH_SHAPE_REST);

		// Each lip is fullest at the seam and flat at its outer edge, so closed
		// the pair is the round tube this replaced rather than two flat ribbons
		// with a crease down the middle.
		expect(at(object3d, 0, CENTRE, 0).z).toBeGreaterThan(at(object3d, 0, CENTRE, ACROSS - 1).z);
		expect(at(object3d, 0, CENTRE, 0).z).toBeCloseTo(at(object3d, 1, CENTRE, 0).z, 6);
		expect(at(object3d, 0, CENTRE, ACROSS - 1).z).toBeCloseTo(0, 6);
	});

	it('faces the camera on both lips', () => {
		const { object3d, setShape } = mouth();
		setShape({ open: 0.7 });
		const normals = object3d.geometry.getAttribute('normal');

		// Wound the wrong way, one lip lights from behind and reads heavier than
		// the other — which is exactly what it looked like.
		const upper = normals.getZ(0 * PER_LIP + CENTRE * ACROSS + 1);
		const lower = normals.getZ(1 * PER_LIP + CENTRE * ACROSS + 1);
		expect(upper).toBeGreaterThan(0.2);
		expect(lower).toBeGreaterThan(0.2);
	});

	it('keeps the corners sealed, so the lips never come apart at the ends', () => {
		const { object3d, setShape } = mouth();
		setShape({ open: 1 });

		const centre = at(object3d, 0, CENTRE, 0).y - at(object3d, 1, CENTRE, 0).y;
		// One column in from the very end. A profile that only reaches zero at
		// the last sample snaps shut over a single segment, and the corner reads
		// as two lips that have come apart and been pinched back together.
		const nearCorner = at(object3d, 0, 1, 0).y - at(object3d, 1, 1, 0).y;

		expect(nearCorner).toBeLessThan(centre * 0.06);
		expect(at(object3d, 0, 0, 0).y).toBeCloseTo(at(object3d, 1, 0, 0).y, 6);
	});

	it('produces finite geometry for every corner of the space', () => {
		const { object3d, setShape } = mouth();
		for (const open of [0, 1]) {
			for (const round of [0, 1]) {
				for (const press of [0, 1]) {
					for (const hiss of [0, 1]) {
						setShape({ open, round, press, hiss, energy: 1 });
						const positions = object3d.geometry.getAttribute('position');
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
