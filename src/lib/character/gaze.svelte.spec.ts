/**
 * Where she is looking.
 *
 * A browser test, because the character builds a canvas-backed receipt texture
 * and cannot be constructed in Node. It is worth the round trip: an inverted
 * pupil is not something a type checker can catch and not something a
 * screenshot reliably shows — she simply looks wrong, and by the time anyone
 * says so it has shipped.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VerityRobot } from './index.js';

/** Advance enough frames for the damped pupil to arrive. */
function settle(robot: VerityRobot, seconds = 1.5) {
	const step = 1 / 60;
	for (let time = 0; time < seconds; time += step) robot.update(time, step);
}

function pupilOf(robot: VerityRobot, index: number): THREE.Object3D {
	const group = robot.eyes[index].userData.pupilGroup as THREE.Object3D;
	expect(group).toBeDefined();
	return group;
}

describe('gaze', () => {
	it('sends the pupils right when she looks right', () => {
		const robot = new VerityRobot();
		// Positive yaw is her turning right — see attachVerityPointerControls.
		robot.setDragRotation(0, 0.3);
		settle(robot);

		for (const index of [0, 1]) expect(pupilOf(robot, index).position.x).toBeGreaterThan(0.01);
		robot.dispose();
	});

	it('sends the pupils left when she looks left', () => {
		const robot = new VerityRobot();
		robot.setDragRotation(0, -0.3);
		settle(robot);

		for (const index of [0, 1]) expect(pupilOf(robot, index).position.x).toBeLessThan(-0.01);
		robot.dispose();
	});

	it('sends the pupils down when she looks down', () => {
		const robot = new VerityRobot();
		// Positive pitch is the pointer below her, so she looks down.
		robot.setDragRotation(0.14, 0);
		settle(robot);

		expect(pupilOf(robot, 0).position.y).toBeLessThan(-0.005);
		robot.dispose();
	});

	it('keeps the pupils inside the white of the eye', () => {
		const robot = new VerityRobot();
		robot.setDragRotation(5, 5); // far past anything the controls produce
		settle(robot);

		const pupil = pupilOf(robot, 0);
		expect(Math.abs(pupil.position.x)).toBeLessThanOrEqual(0.075);
		expect(Math.abs(pupil.position.y)).toBeLessThanOrEqual(0.075);
		robot.dispose();
	});

	it('centres the pupils when she is looking at nothing', () => {
		const robot = new VerityRobot();
		robot.setDragRotation(0.3, 0.3);
		settle(robot);
		robot.setDragRotation(0, 0);
		settle(robot, 2.5);

		const pupil = pupilOf(robot, 0);
		expect(Math.abs(pupil.position.x)).toBeLessThan(0.01);
		expect(Math.abs(pupil.position.y)).toBeLessThan(0.01);
		robot.dispose();
	});

	it('gives her dark pupils, not white ones', () => {
		const robot = new VerityRobot();
		const group = pupilOf(robot, 0);
		const pupil = group.children[0] as THREE.Mesh;
		const colour = (pupil.material as THREE.MeshPhysicalMaterial).color;

		// The face colour is the dark screen she is drawn on; anything near
		// white here is the bug that made her look eyeless.
		expect(colour.getHexString()).toBe('11162f');
		expect(colour.r + colour.g + colour.b).toBeLessThan(0.5);
		robot.dispose();
	});

	it('keeps the highlight on her eye rather than in front of her face', () => {
		const robot = new VerityRobot();
		const group = pupilOf(robot, 0);
		const glint = group.children[1] as THREE.Mesh;

		// Nesting it under the pupil compounded two scale compensations and
		// threw it a whole unit forward, where it read as a floating ball.
		const world = glint.getWorldPosition(new THREE.Vector3());
		const eyeWorld = robot.eyes[0].getWorldPosition(new THREE.Vector3());
		expect(world.z - eyeWorld.z).toBeLessThan(0.2);
		robot.dispose();
	});

	it('lets a deliberate look override the pointer', () => {
		const robot = new VerityRobot();
		robot.setDragRotation(0, -0.3);
		robot.lookAt(0, 0.3, 1);
		settle(robot, 2.5);

		expect(pupilOf(robot, 0).position.x).toBeGreaterThan(0.01);
		robot.dispose();
	});
});
