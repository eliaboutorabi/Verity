/**
 * Her mouth while the receipt is printing.
 *
 * The point of the text driver is that it does not have to guess: the letter
 * under the print head is the letter she is saying, so these tests can ask for
 * the obvious things and expect them exactly.
 */

import { describe, expect, it } from 'vitest';
import { TextMouth, shapeOfLetter } from './mouth-from-text';

/** Print `text` a character at a time and return the pose at the end. */
function print(mouth: TextMouth, text: string, secondsPerCharacter = 0.05) {
	for (const character of text) mouth.push(character, secondsPerCharacter);
	return mouth.push('', 0.001);
}

/** Hold still for a while, the way she does between answers. */
function hold(mouth: TextMouth, seconds: number) {
	let pose = mouth.push('', 1 / 60);
	for (let t = 0; t < seconds; t += 1 / 60) pose = mouth.push('', 1 / 60);
	return pose;
}

describe('shapeOfLetter', () => {
	it('shuts her lips on the bilabials', () => {
		for (const letter of ['m', 'b', 'p']) {
			expect(shapeOfLetter(letter)!.press).toBeGreaterThan(0.9);
		}
		expect(shapeOfLetter('a')!.press).toBe(0);
	});

	it('opens wide on "a" and purses on "u"', () => {
		expect(shapeOfLetter('a')!.open).toBeGreaterThan(shapeOfLetter('i')!.open);
		expect(shapeOfLetter('u')!.round).toBeGreaterThan(0.8);
		expect(shapeOfLetter('e')!.round).toBeLessThan(0.1);
	});

	it('hisses on the sibilants', () => {
		expect(shapeOfLetter('s')!.hiss).toBeGreaterThan(0.8);
		expect(shapeOfLetter('l')!.hiss).toBeLessThan(0.1);
	});

	it('has nothing to say about a space or a full stop', () => {
		expect(shapeOfLetter(' ')).toBeNull();
		expect(shapeOfLetter('.')).toBeNull();
		expect(shapeOfLetter('7')).toBeNull();
	});

	it('gives an unlisted letter a small neutral parting rather than nothing', () => {
		const shape = shapeOfLetter('k')!;
		expect(shape.open).toBeGreaterThan(0);
		expect(shape.open).toBeLessThan(0.4);
	});
});

describe('TextMouth', () => {
	it('shuts on "mm" and opens on "aa"', () => {
		expect(print(new TextMouth(), 'mmmm').press).toBeGreaterThan(0.5);
		expect(print(new TextMouth(), 'aaaa').open).toBeGreaterThan(0.4);
	});

	it('rounds through "oo" and spreads through "ee"', () => {
		const rounded = print(new TextMouth(), 'oooo').round;
		const spread = print(new TextMouth(), 'eeee').round;
		expect(rounded).toBeGreaterThan(0.5);
		expect(spread).toBeLessThan(0.15);
	});

	it('closes her mouth on a space, so words are separable', () => {
		const mouth = new TextMouth();
		print(mouth, 'aaaa');
		const speaking = mouth.push('', 0.001).open;
		const after = print(mouth, '    ', 0.06).open;
		expect(after).toBeLessThan(speaking * 0.5);
	});

	it('settles back to rest once the printing stops', () => {
		const mouth = new TextMouth();
		print(mouth, 'talking');

		// Nothing new arriving, frame after frame: she closes without anybody
		// having to tell her the answer ended.
		const pose = hold(mouth, 1);
		expect(pose.open).toBeLessThan(0.02);
		expect(pose.energy).toBeLessThan(0.02);
	});

	it('carries on when several characters land in one frame', () => {
		// A stream does not arrive one character per frame, and a burst of ten
		// is ten quick shapes rather than one loud one.
		const burst = new TextMouth();
		burst.push('regulation', 1 / 60);
		const pose = burst.push('', 1 / 60);
		expect(Number.isFinite(pose.open)).toBe(true);
		expect(pose.energy).toBeGreaterThan(0);
	});

	it('starts over cleanly for the next answer', () => {
		const mouth = new TextMouth();
		print(mouth, 'aaaa');
		mouth.reset();
		const pose = mouth.push('', 1 / 60);
		expect(pose.open).toBe(0);
		expect(pose.press).toBe(0);
	});
});
