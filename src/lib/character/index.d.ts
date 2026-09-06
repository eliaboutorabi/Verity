/**
 * Type surface for the character.
 *
 * She is written in plain JavaScript — three.js work reads better without the
 * generics, and it keeps her portable — so inference from default values would
 * narrow `appearance` to `"classic"` and `renderer` to `null`. This states the
 * real contract instead. README.md is the prose version of the same thing.
 */

import type { Camera, Group, Material, Mesh, Object3D, WebGLRenderer } from 'three';

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
	/** What the print head put on the paper this frame, at its own pace. */
	readonly justPrinted: string;
	/** Where her lips actually are this frame, after chasing the target. */
	readonly mouthCurrent: {
		open: number;
		round: number;
		press: number;
		hiss: number;
		energy: number;
	};
	readonly mouth: Object3D;
	/** What the print head put on the paper this frame, at its own pace. */
	readonly justPrinted: string;
	/** Where her lips actually are this frame, after chasing the target. */
	readonly mouthCurrent: {
		open: number;
		round: number;
		press: number;
		hiss: number;
		energy: number;
	};
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
	/** Paper flutter and the amplitude her mouth falls back on. */
	setAudioLevel(level: number): void;
	/**
	 * The shape her lips should be in, each channel 0..1.
	 *
	 * Call it every frame while she speaks. Stop, and she settles back to her
	 * resting smile by herself. Anything left unset counts as zero.
	 */
	setMouthPose(pose: {
		open?: number;
		round?: number;
		press?: number;
		hiss?: number;
		energy?: number;
	}): void;
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

/**
 * Her mouth on its own, for anyone building a face rather than using hers.
 *
 * `setShape` rewrites the same vertices in place, so it is cheap to call every
 * frame and allocates nothing after construction.
 */
export interface VerityMouthShape {
	open: number;
	round: number;
	press: number;
	hiss: number;
	energy: number;
	smile: number;
}

export const MOUTH_SHAPE_REST: Readonly<VerityMouthShape>;

export function createVerityMouth(material: Material): {
	object3d: Mesh;
	setShape(shape: Partial<VerityMouthShape>): void;
};
