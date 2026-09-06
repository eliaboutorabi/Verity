import * as THREE from "three";

/**
 * The reference light rig used by the demo. Consumers can use this group as-is,
 * adjust individual lights, or provide their own environment entirely.
 */
export function createVerityStudioLights({
  shadows = true,
  shadowMapSize = 1024,
} = {}) {
  const rig = new THREE.Group();
  rig.name = "VerityStudioLights";

  const ambient = new THREE.HemisphereLight(0xfffdf7, 0x8f8a82, 1.5);
  ambient.name = "VerityAmbient";
  rig.add(ambient);

  const key = new THREE.DirectionalLight(0xfffbf2, 2.75);
  key.name = "VerityKey";
  key.position.set(-5, 7, 6);
  key.castShadow = shadows;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.025;
  rig.add(key);

  const fill = new THREE.DirectionalLight(0xc9c2ff, 0.82);
  fill.name = "VerityFill";
  fill.position.set(5, 1, 5);
  rig.add(fill);

  const rim = new THREE.DirectionalLight(0xfff3df, 0.85);
  rim.name = "VerityRim";
  rim.position.set(4, 6, 1);
  rig.add(rim);

  rig.userData.lights = { ambient, key, fill, rim };
  return rig;
}

/**
 * A soft shadow pooled on the ground beneath her.
 *
 * The obvious approach — a real cast shadow on a `ShadowMaterial` floor — does
 * not work for a character who floats in an empty frame. The camera looks at
 * her horizontally, so the floor is seen almost edge-on and the shadow lands
 * as a hard, foreshortened smear that runs off the bottom of the canvas.
 *
 * This is a blurred ellipse instead, sitting below her and turned to face the
 * lens, leaned back just far enough to read as ground rather than as a disc
 * hanging in the air. Facing the camera is the whole trick: a plane laid flat
 * projects to a two-pixel hairline from this camera height, however wide it
 * is. It cannot be truncated, because it is barely wider than she is and sits
 * inside her framing; it has no edge, because the blur is drawn into its
 * texture; and it still belongs to her, because `follow` slides it under her
 * float and shrinks and fades it as she rises, which is what says she is off
 * the ground.
 */
export function createVeritySoftShadow({
  width = 6,
  height = 1.38,
  y = -3.24,
  lean = 0.3,
  opacity = 0.44,
  color = 0x1d1836,
} = {}) {
  const texture = new THREE.CanvasTexture(drawBlurredPool());
  texture.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      // Under everything, and never writes depth, so nothing of hers can
      // punch a hole in it.
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = "VeritySoftShadow";
  mesh.renderOrder = -1;
  // Facing the lens, leaned back a little at the top, so it sits under her as
  // ground rather than standing up as a wall.
  mesh.rotation.x = -lean;

  const material = mesh.material;

  return {
    object3d: mesh,
    /** Places the shadow for this frame, given the character it belongs to. */
    follow(robot) {
      const scale = robot.object3d.scale.x;
      const float = robot.floatGroup.position.y;
      const yaw = robot.floatGroup.rotation.y;
      // How far off the ground she is, as a fraction of her float range.
      const lift = Math.min(Math.max(float / 0.062, -1), 1);

      mesh.position.set(yaw * 0.9 * scale, y * scale, 0);
      mesh.scale.set(
        width * (1 - lift * 0.07) * scale,
        height * (1 - lift * 0.07) * scale,
        1,
      );
      material.opacity = opacity * (1 - lift * 0.14);
    },
  };
}

/**
 * The pool itself: a soft circle, drawn once.
 *
 * The falloff is hand-stopped rather than linear. A straight gradient fades
 * evenly and reads as a grey disc; a shadow is dense in the middle and gives
 * up quickly at the rim, so most of the alpha is spent in the first third.
 */
function drawBlurredPool(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  const stops = [
    [0, 1],
    [0.32, 0.72],
    [0.55, 0.36],
    [0.75, 0.12],
    [0.9, 0.02],
    [1, 0],
  ];
  for (const [offset, alpha] of stops) {
    gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

export function frameVerityCamera(camera, aspect = 1) {
  camera.aspect = aspect;
  camera.position.set(0, 0.65, aspect < 1 ? 14.5 : 13.5);
  camera.lookAt(0, 0.35, 0);
  camera.updateProjectionMatrix();
}
