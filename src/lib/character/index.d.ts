/**
 * Type surface for the vendored Verity robot.
 *
 * The implementation is plain JavaScript carried over verbatim from the
 * original prototype (see VENDOR.md), so its option types would otherwise be
 * inferred from default values — `appearance` would narrow to `"classic"`
 * and `renderer` to `null`. This file states the real contract, exactly as
 * documented in README.md, without editing vendored code.
 */

import type { Camera, Group, Mesh, Object3D, WebGLRenderer } from 'three';

export type VerityAppearance = 'classic' | 'rose';
export type VerityMode = 'idle' | 'listening' | 'thinking' | 'speaking';
/** A momentary reaction, distinct from the behavioural {@link VerityMode}. */
export type VerityExpression = 'neutral' | 'delight' | 'concern' | 'nod';

export interface VerityRobotOptions {
	/** Lets the receipt texture use the device's maximum anisotropy. */
	renderer?: WebGLRenderer | null;
	appearance?: VerityAppearance;
	accent?: string;
	scale?: number;
	reducedMotion?: boolean;
}

export interface VerityState {
	mode: VerityMode;
	audioLevel: number;
	paperProgress: number;
	printedTranscript: string;
	receiptLines: { id: number; text: string; feedPosition: number }[];
}

export class VerityRobot {
	constructor(options?: VerityRobotOptions);

	readonly object3d: Group;
	readonly root: Group;
	/** Everything that floats, breathes and turns; the root itself never moves. */
	readonly floatGroup: Group;
	readonly mouth: Object3D;
	/** The keypad, in reading order: +, −, ×, =. */
	readonly keys: Object3D[];
	/** The two eyes. Each carries its pupil group in `userData.pupilGroup`. */
	readonly eyes: Object3D[];

	paperProgress: number;
	paperFeedDistance: number;
	paperPathLength: number;
	paperTextTravel: number;
	printedTranscript: string;
	pendingReceiptText: string;
	receiptLines: { id: number; text: string; feedPosition: number }[];

	setMode(mode: VerityMode): void;

	/** Press a key by index. It travels and springs back on its own. */
	pressKey(index: number): boolean;
	/** How far a key is depressed, 0–1 — for a caller driving sound. */
	keyPressAmount(index: number): number;
	/** React for a moment. Decays on its own; fire and forget. */
	react(kind?: VerityExpression, strength?: number): void;
	/**
	 * Look at something, taking `weight` of her attention from the pointer.
	 * Same units as {@link setDragRotation}.
	 */
	lookAt(pitch: number, yaw: number, weight?: number): void;
	/** Hand her attention back to the pointer. */
	releaseGaze(): void;
	/** Mouth amplitude and paper flutter. Call every audio-analysis frame. */
	setAudioLevel(level: number): void;
	/** Keep true while output is genuinely audible, not merely in progress. */
	setOutputAudioActive(active: boolean): void;
	beginResponse(): void;
	appendTranscript(delta: string): void;
	clearTranscript(): void;
	setDragRotation(pitch: number, yaw: number): void;
	resetRotation(): void;
	update(time: number, deltaTime: number): void;
	getState(): VerityState;
	dispose(): void;
}

export const VERITY_APPEARANCES: readonly VerityAppearance[];
export const VERITY_MODES: readonly VerityMode[];
export const VERITY_DEFAULTS: Readonly<Record<string, unknown>>;

export interface PointerControlOptions {
	maxPitch?: number;
	maxYaw?: number;
	damping?: number;
}

/** Gentle pointer following on desktop, drag rotation on touch. */
export function attachVerityPointerControls(
	element: HTMLElement,
	robot: VerityRobot,
	options?: PointerControlOptions
): () => void;

export function attachVerityDragControls(
	element: HTMLElement,
	robot: VerityRobot,
	options?: PointerControlOptions
): () => void;

export function createVerityStudioLights(options?: Record<string, unknown>): Group;

/**
 * A soft shadow pooled on the ground beneath her.
 *
 * Add `object3d` to the scene and call `follow(robot)` once a frame, before
 * rendering, so the shadow slides under her float and fades as she rises. It
 * needs no shadow map: the blur is drawn into its texture.
 */
export function createVeritySoftShadow(options?: {
	width?: number;
	height?: number;
	y?: number;
	lean?: number;
	opacity?: number;
	color?: number;
}): { object3d: Mesh; follow(robot: VerityRobot): void };

export function frameVerityCamera(camera: Camera, aspect?: number): void;
