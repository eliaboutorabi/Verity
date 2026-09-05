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
 * A floor that catches her shadow and is otherwise invisible.
 *
 * A CSS blob under the canvas cannot move with her: she floats, breathes and
 * turns, and a shadow that ignores all of that reads as a sticker. This is a
 * real plane with a `ShadowMaterial`, so the shadow is cast by the same light
 * that lights her and moves with everything she does.
 *
 * Nothing else about it renders — the plane itself is fully transparent, so it
 * composites over whatever the page background happens to be.
 */
export function createVerityShadowFloor({ y = -3.05, size = 26, opacity = 0.24 } = {}) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShadowMaterial({ opacity, transparent: true }),
  );
  floor.name = "VerityShadowFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.receiveShadow = true;
  // Never occludes her, whatever the camera does.
  floor.renderOrder = -1;
  return floor;
}

export function frameVerityCamera(camera, aspect = 1) {
  camera.aspect = aspect;
  camera.position.set(0, 0.65, aspect < 1 ? 14.5 : 13.5);
  camera.lookAt(0, 0.35, 0);
  camera.updateProjectionMatrix();
}
