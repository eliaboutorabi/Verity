/**
 * Making the character something you can touch.
 *
 * Two pieces, both living outside the character: hit-testing a pointer against
 * her keypad, and aiming her gaze at a place on the screen. Neither needs to
 * know how she is built — the first raycasts against the key groups she
 * exposes, the second speaks in the same units as `lookAt`.
 */

import * as THREE from 'three';
import type { VerityRobot } from '$lib/character/index.js';

/**
 * Attach key pressing to a canvas.
 *
 * Uses `pointerup` rather than `pointerdown` so a drag that starts on a key
 * rotates her instead of pressing it — the pointer controls own dragging, and
 * a key that fires halfway through a rotation feels broken.
 */
export function attachKeyPresses(
	canvas: HTMLCanvasElement,
	getRobot: () => VerityRobot | null,
	onPress: (index: number) => void
): () => void {
	const raycaster = new THREE.Raycaster();
	const point = new THREE.Vector2();
	let downAt: { x: number; y: number; time: number } | null = null;

	const onPointerDown = (event: PointerEvent) => {
		downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
	};

	const onPointerUp = (event: PointerEvent) => {
		const start = downAt;
		downAt = null;
		if (!start) return;

		// A press, not a drag and not a long hold.
		const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
		if (moved > 8 || performance.now() - start.time > 600) return;

		const robot = getRobot();
		const camera = cameraFor(canvas);
		if (!robot || !camera) return;

		const rect = canvas.getBoundingClientRect();
		point.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		point.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(point, camera);

		const hits = raycaster.intersectObjects(robot.keys, true);
		if (!hits.length) return;

		// The key group is an ancestor of whatever the ray actually struck.
		const index = robot.keys.findIndex((key) => isAncestorOf(key, hits[0].object));
		if (index === -1) return;

		robot.pressKey(index);
		onPress(index);
	};

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);
	return () => {
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointerup', onPointerUp);
	};
}

function isAncestorOf(ancestor: THREE.Object3D, node: THREE.Object3D): boolean {
	for (let current: THREE.Object3D | null = node; current; current = current.parent) {
		if (current === ancestor) return true;
	}
	return false;
}

/**
 * The camera the canvas is being rendered with.
 *
 * Stashed by the stage rather than passed through every call site: the
 * interaction only needs it at the moment of a click, and threading it through
 * would put a Three.js type in the signature of everything in between.
 */
const CAMERAS = new WeakMap<HTMLCanvasElement, THREE.Camera>();

export function registerCamera(canvas: HTMLCanvasElement, camera: THREE.Camera): void {
	CAMERAS.set(canvas, camera);
}

function cameraFor(canvas: HTMLCanvasElement): THREE.Camera | undefined {
	return CAMERAS.get(canvas);
}

/** How far she will turn. Past this she looks unhinged rather than attentive. */
const MAX_PITCH = 0.26;
const MAX_YAW = 0.42;

/**
 * Aim her at a point on the page.
 *
 * Takes viewport coordinates because that is what callers have — the bounding
 * box of a card that just appeared, the middle of a panel — and converts to
 * her rotation units relative to her own position on screen.
 */
export function gazeAtPoint(
	robot: VerityRobot,
	canvas: HTMLCanvasElement,
	clientX: number,
	clientY: number,
	weight = 0.85
): void {
	const rect = canvas.getBoundingClientRect();
	const centreX = rect.left + rect.width / 2;
	const centreY = rect.top + rect.height / 2;

	// Normalised against her own size, so a card just beside her and one across
	// a wide screen do not produce the same stare.
	const dx = (clientX - centreX) / Math.max(rect.width, 1);
	const dy = (clientY - centreY) / Math.max(rect.height, 1);

	const yaw = THREE.MathUtils.clamp(dx * 0.55, -MAX_YAW, MAX_YAW);
	const pitch = THREE.MathUtils.clamp(dy * 0.4, -MAX_PITCH, MAX_PITCH);
	robot.lookAt(pitch, yaw, weight);
}

/** Aim her at an element, if it is on screen. */
export function gazeAtElement(
	robot: VerityRobot,
	canvas: HTMLCanvasElement,
	element: Element | null,
	weight = 0.85
): boolean {
	if (!element) return false;
	const rect = element.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) return false;
	gazeAtPoint(robot, canvas, rect.left + rect.width / 2, rect.top + rect.height / 2, weight);
	return true;
}
