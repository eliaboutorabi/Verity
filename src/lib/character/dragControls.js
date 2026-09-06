import * as THREE from "three";

/**
 * Where she should be looking, given a pointer anywhere on the page.
 *
 * `Math.tanh` rather than a clamp. A clamp saturates: past roughly one canvas
 * away she hit the limit and stopped responding, so moving the pointer down
 * to the composer — or off the bottom of the window — looked exactly like her
 * losing track of it. tanh is near-linear close to her, so small movements
 * still read precisely, and approaches the limit without ever reaching it, so
 * she keeps answering the pointer however far away it goes.
 *
 * Exported because it is the whole behaviour, and a pure function of a
 * rectangle and a point is worth being able to test.
 */
export function followRotation(bounds, clientX, clientY, {
  maxPitch = 0.28,
  maxYaw = 0.34,
} = {}) {
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const horizontalReach = Math.max(bounds.width * 0.92, 1);
  const verticalReach = Math.max(bounds.height * 0.95, 1);

  return {
    pitch: Math.tanh((clientY - centerY) / verticalReach) * maxPitch,
    yaw: Math.tanh((clientX - centerX) / horizontalReach) * maxYaw,
  };
}

/**
 * Makes the robot follow a mouse and remain draggable on touch screens without
 * making the robot itself depend on DOM input.
 * Returns a cleanup function for component unmounting or scene disposal.
 */
export function attachVerityPointerControls(element, robot, {
  maxPitch = 0.34,
  maxYaw = 0.85,
  pitchSensitivity = 0.9,
  yawSensitivity = 1.55,
  followMouse = true,
  followMaxPitch = 0.28,
  followMaxYaw = 0.34,
  trackingElement = window,
  resetOnDoubleClick = true,
} = {}) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startPitch = 0;
  let startYaw = 0;

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.pointerType === "mouse") return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startPitch = robot.dragRotationTarget.x;
    startYaw = robot.dragRotationTarget.y;
    element.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event) => {
    if (event.pointerId !== pointerId) return;
    const bounds = element.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    const yaw = THREE.MathUtils.clamp(
      startYaw + (event.clientX - startX) / width * yawSensitivity,
      -maxYaw,
      maxYaw,
    );
    const pitch = THREE.MathUtils.clamp(
      startPitch + (event.clientY - startY) / height * pitchSensitivity,
      -maxPitch,
      maxPitch,
    );
    robot.setDragRotation(pitch, yaw);
  };

  const handleMouseFollow = (event) => {
    if (!followMouse || event.pointerType !== "mouse" || pointerId !== null) return;
    const { pitch, yaw } = followRotation(
      element.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      { maxPitch: followMaxPitch, maxYaw: followMaxYaw },
    );
    robot.setDragRotation(pitch, yaw);
  };

  const finishDrag = (event) => {
    if (event.pointerId !== pointerId) return;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    pointerId = null;
  };

  const resetRotation = () => robot.resetRotation();

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handleDragMove);
  element.addEventListener("pointerup", finishDrag);
  element.addEventListener("pointercancel", finishDrag);
  trackingElement.addEventListener("pointermove", handleMouseFollow);
  /*
   * No reset when the window loses focus.
   *
   * Moving the pointer off the bottom of the screen — onto a dock, another
   * app — blurs the window, and snapping her head back to centre at that exact
   * moment is precisely what reads as losing track. Holding the last direction
   * is both more lifelike and what someone watching expects: she is still
   * looking where the pointer went, and picks it up again when it comes back.
   */
  if (resetOnDoubleClick) element.addEventListener("dblclick", resetRotation);

  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointermove", handleDragMove);
    element.removeEventListener("pointerup", finishDrag);
    element.removeEventListener("pointercancel", finishDrag);
    trackingElement.removeEventListener("pointermove", handleMouseFollow);
    if (resetOnDoubleClick) element.removeEventListener("dblclick", resetRotation);
  };
}

/** Preserves the original drag-only helper for existing integrations. */
export function attachVerityDragControls(element, robot, options = {}) {
  return attachVerityPointerControls(element, robot, {
    ...options,
    followMouse: false,
  });
}
