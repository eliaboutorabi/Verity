/**
 * What her mouth does with a given sound.
 *
 * Tested against synthesised spectra rather than recordings. `spectralFeatures`
 * takes a magnitude spectrum, so a vowel can be built directly in the frequency
 * domain — harmonics of a fundamental, shaped by two resonances at the formants
 * we want — and no audio file, FFT or decoder is needed to ask the real
 * question: with a spectrum shaped like an "ee", does she make an "ee" mouth?
 *
 * The constants these pin were calibrated against synthesised speech; the note
 * in lipsync.ts has the measurements. What is pinned here is the orderings
 * those constants exist to produce, which is what a later edit could quietly
 * break without any type or screenshot noticing.
 */

import { describe, expect, it } from 'vitest';
import { MouthDriver, shapeOf, spectralFeatures } from './lipsync';

const BIN_HZ = 24_000 / 2048;
const BINS = 1024;

/** One resonance, as a peak of the given width. */
function resonance(hz: number, centre: number, width: number): number {
	const offset = (hz - centre) / width;
	return 1 / (1 + offset * offset);
}

/**
 * A vowel with the given formants, as a magnitude spectrum.
 *
 * Harmonics of a 150 Hz fundamental with a natural downward tilt, each raised
 * or damped by how close it lands to F1 and F2. Crude next to a real vocal
 * tract, and exactly the structure the feature extractor is looking at.
 */
function vowel(f1: number, f2: number, { f0 = 150, gain = 1 } = {}): Float64Array {
	const magnitudes = new Float64Array(BINS);
	for (let harmonic = 1; harmonic * f0 < BINS * BIN_HZ; harmonic += 1) {
		const hz = harmonic * f0;
		const bin = Math.round(hz / BIN_HZ);
		const shaped = resonance(hz, f1, 110) + 0.55 * resonance(hz, f2, 150);
		magnitudes[bin] += (gain * shaped) / harmonic;
	}
	return magnitudes;
}

/** A sibilant: broadband noise, nearly all of it high. */
function sibilant(gain = 1): Float64Array {
	const magnitudes = new Float64Array(BINS);
	for (let bin = 1; bin < BINS; bin += 1) {
		const hz = bin * BIN_HZ;
		magnitudes[bin] = hz > 4000 && hz < 9000 ? gain * 0.5 : gain * 0.01;
	}
	return magnitudes;
}

/** The pose one spectrum asks for, before any smoothing. */
function poseOf(magnitudes: Float64Array, energy = 0.6) {
	return shapeOf(spectralFeatures(magnitudes, BIN_HZ), energy);
}

// Roughly the classic vowel-chart values for an adult voice.
const EE = vowel(300, 2300);
const AH = vowel(730, 1100);
const OO = vowel(300, 870);
const UH = vowel(500, 1500);

describe('reading a vowel', () => {
	it('opens for "ah" and stays shut for "ee"', () => {
		expect(poseOf(AH).open).toBeGreaterThan(0.5);
		expect(poseOf(EE).open).toBeLessThan(0.15);
		expect(poseOf(UH).open).toBeGreaterThan(poseOf(EE).open);
		expect(poseOf(UH).open).toBeLessThan(poseOf(AH).open);
	});

	it('purses for "oo" and spreads for "ee"', () => {
		expect(poseOf(OO).round).toBeGreaterThan(0.5);
		expect(poseOf(EE).round).toBeLessThan(0.1);
	});

	it('does not purse for "ah", which is just as far back as "oo"', () => {
		// The regression this whole mapping exists to avoid. F2 alone says both
		// vowels are back; only the jaw separates a pursed "oo" from a wide
		// "ah", so rounding has to be gated on how closed she is.
		expect(spectralFeatures(AH, BIN_HZ).f2).toBeLessThan(spectralFeatures(EE, BIN_HZ).f2);
		expect(poseOf(AH).round).toBeLessThan(0.2);
	});

	it('narrows to a slit on a sibilant, rather than opening', () => {
		const pose = poseOf(sibilant());
		expect(pose.hiss).toBeGreaterThan(0.8);
		expect(pose.open).toBeLessThan(0.2);
	});

	it('leaves lip closure alone, because the spectrum cannot see it', () => {
		// Stated as a test so nobody adds a nasal heuristic here without first
		// reading why the last one was removed.
		for (const spectrum of [EE, AH, OO, sibilant()]) {
			expect(poseOf(spectrum).press).toBe(0);
		}
	});
});

describe('judging loudness against her own', () => {
	const settle = (driver: MouthDriver, spectrum: Float64Array, seconds: number) => {
		for (let t = 0; t < seconds; t += 1 / 60) {
			driver.push(spectralFeatures(spectrum, BIN_HZ), 1 / 60);
		}
		return driver.pose;
	};

	it('opens the same amount whether she is loud or quiet', () => {
		const loud = settle(new MouthDriver(), vowel(730, 1100, { gain: 4 }), 3);
		const quiet = settle(new MouthDriver(), vowel(730, 1100, { gain: 0.05 }), 3);

		// A fortieth of the amplitude, and the same mouth: what matters is that
		// this is a wide vowel for her, not how many decibels it was.
		expect(quiet.open).toBeGreaterThan(0.4);
		expect(Math.abs(loud.open - quiet.open)).toBeLessThan(0.15);
	});

	it('treats true silence as silence, whatever the statistics say', () => {
		const driver = new MouthDriver();
		settle(driver, AH, 2);
		const speaking = driver.pose.open;
		expect(speaking).toBeGreaterThan(0.3);

		settle(driver, new Float64Array(BINS), 1.5);
		expect(driver.pose.open).toBeLessThan(0.02);
		expect(driver.pose.energy).toBeLessThan(0.02);
	});

	it('opens faster than it closes', () => {
		const opening = new MouthDriver();
		settle(opening, AH, 0.1);
		const afterOpening = opening.pose.open;

		const closing = new MouthDriver();
		settle(closing, AH, 3);
		const held = closing.pose.open;
		settle(closing, EE, 0.1);
		const fallen = held - closing.pose.open;

		// A jaw drops under its own weight and is pulled back up. Equal rates
		// both ways is what makes procedural lip sync look like a hinge.
		expect(afterOpening / held).toBeGreaterThan(fallen / held);
	});
});
