<script lang="ts">
	/**
	 * The robot's home on screen.
	 *
	 * This component owns the renderer, camera, lights and animation loop; the
	 * character itself owns nothing but its own geometry and motion. Everything
	 * the robot reacts to arrives as a prop or through the exported methods, so
	 * the voice session and the text agent drive it the same way.
	 */
	import * as THREE from 'three';
	import {
		VerityRobot,
		attachVerityPointerControls,
		createVeritySoftShadow,
		createVerityStudioLights
	} from '$lib/character/index.js';
	import { CHARACTERS, type CharacterId } from '$lib/voices';
	import { printerEnvelope } from './printer-envelope.js';
	import { MOUTH_AT_REST, type MouthPose } from '$lib/client/lipsync';
	import { TextMouth } from '$lib/client/mouth-from-text';
	import { playKey } from '$lib/client/keysound';
	import { attachKeyPresses, gazeAtElement, registerCamera } from '$lib/client/robot-interaction';

	interface Props {
		character: CharacterId;
		/** Finish her for a dark page rather than a bone-coloured one. */
		dark?: boolean;
		mode: 'idle' | 'listening' | 'thinking' | 'speaking';
		audioLevel?: number;
		audible?: boolean;
		/**
		 * The shape her lips should be in, from whoever is driving the voice.
		 * Absent in text mode, where the printed answer drives them instead.
		 */
		mouth?: MouthPose;
		/**
		 * Text mode has no waveform, but the receipt only advances while output
		 * is audible. Setting this synthesises a printer-like envelope so a typed
		 * answer prints onto the paper exactly as a spoken one does.
		 */
		printing?: boolean;
		/** Someone pressed one of her keys. Index is +, −, ×, = in order. */
		onkeypress?: (index: number) => void;
	}

	let {
		character,
		dark = false,
		mode,
		audioLevel = 0,
		audible = false,
		mouth = MOUTH_AT_REST,
		printing = false,
		onkeypress
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let robot: VerityRobot | null = null;
	let renderer: THREE.WebGLRenderer | null = null;
	let scene: THREE.Scene | null = null;
	let camera: THREE.PerspectiveCamera | null = null;
	let shadow: ReturnType<typeof createVeritySoftShadow> | null = null;
	let detachPointer: (() => void) | null = null;
	let detachKeys: (() => void) | null = null;
	let gazeRelease: ReturnType<typeof setTimeout> | undefined;
	/** Flips once the scene exists, which is what gates the character effect. */
	let ready = $state(false);

	/**
	 * Props mirrored into plain locals.
	 *
	 * The render loop is a long-lived requestAnimationFrame closure rather than
	 * a reactive context, so it reads these rather than the props directly —
	 * one obvious place where the current frame's inputs come from, instead of
	 * relying on how prop access behaves inside a captured callback.
	 */
	const inputs = { level: 0, audible: false, printing: false, mouth: MOUTH_AT_REST };

	/**
	 * Her mouth while she is typing.
	 *
	 * Text mode is the one case where the words and the clock are both ours, so
	 * her lips can be driven from the letters going onto the receipt rather than
	 * from a synthesised wobble. It reads the same buffer the paper does, so
	 * what her mouth is doing and what the paper says are the same thing.
	 */
	const typing = new TextMouth();

	/**
	 * How the camera is placed.
	 *
	 * The vendored `frameVerityCamera` puts the camera at a fixed distance, which
	 * is right for the square-ish phone frame it was written for and wrong
	 * everywhere else — in a tall column it crops her legs, in a short band it
	 * crops her head. Measuring the character once and fitting to those bounds
	 * makes the framing correct at any shape, and leaves room above her for the
	 * receipt, which grows as she talks.
	 */
	let bounds: { center: THREE.Vector3; size: THREE.Vector3 } | null = null;

	/** Breathing room around the character, as a multiple of the fitted distance. */
	const FRAME_PADDING = 1.04;

	function measure(character: VerityRobot): void {
		const box = new THREE.Box3().setFromObject(character.object3d);
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());

		/*
		 * Headroom for the paper above her, and room below for the shadow.
		 *
		 * Kept tight. Reserving 30% for a receipt that only exists while she is
		 * printing left her permanently filling two-thirds of her own frame,
		 * which is most of why she read as small. The paper may now brush the
		 * top edge while it runs; she is worth more than the last inch of it.
		 */
		const headroom = size.y * 0.13;
		// Enough that her shadow has somewhere to fall.
		const footroom = size.y * 0.12;
		size.y += headroom + footroom;
		center.y += headroom * 0.32 - footroom * 0.5;

		bounds = { center, size };
	}

	function fitCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
		camera.aspect = aspect;
		if (!bounds) {
			camera.updateProjectionMatrix();
			return;
		}

		const { center, size } = bounds;
		const halfFov = (camera.fov * Math.PI) / 360;
		const forHeight = size.y / 2 / Math.tan(halfFov);
		const forWidth = size.x / 2 / Math.tan(halfFov) / aspect;

		camera.position.set(center.x, center.y, center.z + Math.max(forHeight, forWidth) * FRAME_PADDING);
		camera.lookAt(center);
		camera.updateProjectionMatrix();
	}

	$effect(() => {
		inputs.level = audioLevel;
		inputs.audible = audible;
		inputs.printing = printing;
		inputs.mouth = mouth;
	});

	/** Buffered while the scene boots, so no transcript text is dropped. */
	const queued: string[] = [];

	export function beginResponse(): void {
		if (robot) robot.beginResponse();
	}

	export function appendTranscript(delta: string): void {
		if (robot) robot.appendTranscript(delta);
		else queued.push(delta);
	}

	export function clearTranscript(): void {
		queued.length = 0;
		typing.reset();
		robot?.clearTranscript();
	}

	/**
	 * Look at something on the page.
	 *
	 * Callers pass an element — the card that just appeared, the panel she is
	 * filling in — and she turns toward it for a few seconds before handing her
	 * attention back to the pointer.
	 */
	export function look(element: Element | null, hold = 2600): void {
		if (!robot || !canvas) return;
		clearTimeout(gazeRelease);

		if (!element) {
			robot.releaseGaze();
			return;
		}
		if (!gazeAtElement(robot, canvas, element)) return;
		gazeRelease = setTimeout(() => robot?.releaseGaze(), hold);
	}

	/** React for a moment: delight, concern, or a nod. */
	export function react(kind: 'delight' | 'concern' | 'nod' = 'delight'): void {
		robot?.react(kind);
	}

	/** A snapshot of the character's animation state, for tests and debugging. */
	export function debugState() {
		if (!robot) return null;
		return {
			...robot.getState(),
			inputs: { ...inputs },
			mouth: { ...robot.mouthCurrent },
			outputAudioActive: (robot as unknown as { outputAudioActive: boolean }).outputAudioActive,
			// Where she and her shadow land in the frame, in normalised device
			// coordinates: -1 is the bottom edge, 1 the top. The one number that
			// says whether either is being cut off.
			frame: camera
				? {
						feet: robot.object3d.localToWorld(new THREE.Vector3(0, -3, 0.94)).project(camera).y,
						shadow: shadow
							? shadow.object3d.getWorldPosition(new THREE.Vector3()).project(camera).y
							: null
					}
				: null,
			paperFeedDistance: robot.paperFeedDistance,
			paperProgress: robot.paperProgress
		};
	}

	$effect(() => {
		if (!canvas) return;

		const world = new THREE.Scene();
		const view = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
		camera = view;
		// The interaction layer needs it at click time to cast a ray.
		registerCamera(canvas, view);
		world.add(createVerityStudioLights());
		// Soft, blurred, and hers: it follows her float and parallaxes against
		// her turn, rather than sitting behind the canvas as a static blob.
		shadow = createVeritySoftShadow();
		world.add(shadow.object3d);
		scene = world;

		const gl = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			powerPreference: 'high-performance'
		});
		gl.outputColorSpace = THREE.SRGBColorSpace;
		// Capping at 2 keeps a 3× phone from rendering four times the pixels for
		// a difference nobody can see on a character this soft.
		gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		gl.shadowMap.enabled = true;
		gl.shadowMap.type = THREE.PCFSoftShadowMap;
		gl.toneMapping = THREE.ACESFilmicToneMapping;
		gl.toneMappingExposure = 0.98;
		renderer = gl;

		let frame = 0;
		let previous = performance.now();

		const resize = () => {
			const width = Math.max(1, Math.floor(canvas!.clientWidth));
			const height = Math.max(1, Math.floor(canvas!.clientHeight));
			const ratio = gl.getPixelRatio();
			if (
				canvas!.width === Math.floor(width * ratio) &&
				canvas!.height === Math.floor(height * ratio)
			) {
				return;
			}
			gl.setSize(width, height, false);
			fitCamera(view, width / height);
		};

		const animate = (now: number) => {
			frame = requestAnimationFrame(animate);
			resize();
			const delta = Math.min((now - previous) / 1000, 0.05);
			previous = now;

			if (robot) {
				if (inputs.printing) {
					robot.setAudioLevel(printerEnvelope(now / 1000));
					robot.setOutputAudioActive(true);
					// `justPrinted` is a frame behind, since `update` writes it. At
					// sixteen milliseconds that is nothing, and reading it here keeps
					// her mouth on the paper's clock rather than the network's.
					robot.setMouthPose(typing.push(robot.justPrinted, delta));
				} else {
					robot.setAudioLevel(inputs.level);
					robot.setOutputAudioActive(inputs.audible);
					robot.setMouthPose(inputs.mouth);
				}
				robot.update(now / 1000, delta);
				shadow?.follow(robot);
			}
			gl.render(world, view);
		};

		frame = requestAnimationFrame(animate);
		ready = true;

		return () => {
			cancelAnimationFrame(frame);
			detachPointer?.();
			detachPointer = null;
			robot?.dispose();
			robot = null;
			gl.dispose();
			renderer = null;
			scene = null;
			camera = null;
			bounds = null;
			ready = false;
		};
	});

	// Swapping characters — or the theme — rebuilds her, but not the scene
	// around her. Her finish is baked into her materials, so it is a rebuild
	// rather than a tint.
	$effect(() => {
		const appearance = CHARACTERS[character].appearance;
		const finish = dark;
		if (!ready || !renderer || !scene || !canvas) return;

		const next = new VerityRobot({ renderer, appearance, dark: finish });
		scene.add(next.object3d);
		robot = next;
		detachPointer = attachVerityPointerControls(canvas, next);

		// Her keys are hers to press, and pressing one should feel like
		// something happened: it travels, it clicks, and she likes it.
		detachKeys = attachKeyPresses(
			canvas,
			() => robot,
			(index) => {
				playKey(index);
				next.react('delight', index === 3 ? 1 : 0.7);
				onkeypress?.(index);
			}
		);

		// Measure before the first frame moves her, then reframe — until a
		// character existed there was nothing to fit the camera to.
		measure(next);
		if (camera) {
			fitCamera(camera, Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight));
		}

		// Anything the transport said while the scene was booting still prints.
		for (const delta of queued.splice(0)) next.appendTranscript(delta);

		return () => {
			detachPointer?.();
			detachPointer = null;
			detachKeys?.();
			detachKeys = null;
			clearTimeout(gazeRelease);
			next.dispose();
			if (robot === next) robot = null;
		};
	});

	$effect(() => {
		robot?.setMode(mode);
	});

</script>

<div class="stage" data-mode={mode}>
	<div class="glow" aria-hidden="true"></div>
	<canvas
		bind:this={canvas}
		aria-label="Verity, an animated calculator robot. Her keys can be pressed."
	></canvas>
</div>

<style>
	.stage {
		position: relative;
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	canvas {
		position: relative;
		z-index: 1;
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}

	/*
	 * A pool of light on the ground rather than a panel behind her: warm, wide,
	 * and slightly stronger while she is speaking.
	 */
	.glow {
		position: absolute;
		left: 50%;
		bottom: 6%;
		width: 78%;
		height: 34%;
		transform: translateX(-50%);
		border-radius: 50%;
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--accent) 22%, var(--glow-tint)) 0%,
			color-mix(in srgb, var(--accent) 8%, var(--glow-tint)) 45%,
			transparent 78%
		);
		opacity: 0.5;
		filter: blur(14px);
		transition: opacity 600ms var(--ease);
	}

	.stage[data-mode='speaking'] .glow {
		opacity: 0.9;
	}

	.stage[data-mode='listening'] .glow {
		opacity: 0.68;
	}
</style>
