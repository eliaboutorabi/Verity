import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createVerityMouth } from "./mouthShape.js";

export const VERITY_MODES = Object.freeze({
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
});

/**
 * How far a pupil travels before it would leave the white of the eye.
 *
 * The gap between the eye radius and the pupil radius, less a hair. A large
 * anime pupil fills most of the eye, so the room to move is small — the head
 * does the rest of the work.
 */
const EYE_RADIUS_REACH = 0.07;

/**
 * How she is finished in a dark room.
 *
 * Only the surfaces that catch light, and only enough to take the glare off:
 * an ivory shell that is right on a bone-coloured page is a lamp on a dark one,
 * and the eye goes to it instead of to the answer. Her screen goes *darker*
 * rather than lighter, so the face stays the darkest thing about her and the
 * eyes still read; the paper stays near-white, because paper is.
 */
const DARK_FINISH = Object.freeze({
  classic: Object.freeze({
    body: 0xbdb9bb,
    bodySide: 0xa6a2a5,
    faceRim: 0x76737a,
    face: 0x0a0d1c,
    key: 0x4b4e5d,
    symbol: 0xeceaf4,
    mouth: 0x9294a3,
    slot: 0x33353f,
    paper: 0xe8e6e0,
    paperBack: 0xcecabf,
    paperEdge: 0xb6b1a6,
    paperCss: "#e8e6e0",
    paperRgb: "232, 230, 224",
  }),
  rose: Object.freeze({
    body: 0xc4a6ae,
    bodySide: 0xac8b96,
    faceRim: 0x7d626e,
    face: 0x1a0d14,
    key: 0x654a58,
    symbol: 0xf3e3ea,
    mouth: 0xb695a5,
    slot: 0x3d2c36,
    paper: 0xecd9e1,
    paperBack: 0xd2bcc6,
    paperEdge: 0xba9fac,
    paperCss: "#ecd9e1",
    paperRgb: "236, 217, 225",
  }),
});

export const VERITY_APPEARANCES = Object.freeze({
  classic: Object.freeze({
    accent: "#5B4CB0",
    body: 0xf1eee5,
    bodySide: 0xe3ded3,
    faceRim: 0xaaa69f,
    face: 0x11162f,
    key: 0x666976,
    symbol: 0xfffdf6,
    mouth: 0xc3c4c7,
    slot: 0x454852,
    paper: 0xfffdf7,
    paperBack: 0xe9e4da,
    paperEdge: 0xd8d2c7,
    paperCss: "#fffdf6",
    paperRgb: "255, 253, 246",
    earrings: false,
  }),
  rose: Object.freeze({
    accent: "#C84F82",
    body: 0xf6e8e7,
    bodySide: 0xe5cecf,
    faceRim: 0xb49ca8,
    face: 0x28172f,
    key: 0x896d80,
    symbol: 0xfffbf7,
    mouth: 0xe6cbd8,
    slot: 0x594654,
    paper: 0xffedf3,
    paperBack: 0xead5dd,
    paperEdge: 0xdabac7,
    paperCss: "#fcebf1",
    paperRgb: "252, 235, 241",
    earrings: true,
  }),
});

export const VERITY_DEFAULTS = Object.freeze({
  appearance: "classic",
  accent: VERITY_APPEARANCES.classic.accent,
  scale: 0.9,
});

function createClayBumpTexture() {
  const size = 128;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const textureContext = textureCanvas.getContext("2d");
  const image = textureContext.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broadNoise = Math.sin(x * 0.17) * 3.5
        + Math.sin(y * 0.13) * 3.2
        + Math.sin((x + y) * 0.075) * 2.5;
      const fineNoise = Math.sin(x * 1.71 + y * 2.13) * 1.2;
      const value = Math.round(128 + broadNoise + fineNoise);
      const index = (y * size + x) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }

  textureContext.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

let clayBumpTexture = null;

function getClayBumpTexture() {
  clayBumpTexture ||= createClayBumpTexture();
  return clayBumpTexture;
}

function roundedMaterial(color, roughness = 0.84, metalness = 0, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    specularIntensity: options.specularIntensity ?? 0.24,
    specularColor: options.specularColor ?? 0xfff8ee,
    bumpMap: options.bumpScale === 0 ? null : getClayBumpTexture(),
    bumpScale: options.bumpScale ?? 0.012,
    clearcoat: options.clearcoat ?? 0,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.85,
  });
}

function makeRoundedBox(width, height, depth, radius, material, segments = 7) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, segments, radius),
    material,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeRoundedPanel(width, height, depth, radius, material) {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.045,
    bevelSegments: 5,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geometry, material);
}

function makeSoftCylinder(length, radius, bevel, material) {
  const halfLength = length / 2;
  const profile = [
    new THREE.Vector2(0, -halfLength),
    new THREE.Vector2(radius - bevel, -halfLength),
    new THREE.Vector2(radius, -halfLength + bevel),
    new THREE.Vector2(radius, halfLength - bevel),
    new THREE.Vector2(radius - bevel, halfLength),
    new THREE.Vector2(0, halfLength),
  ];
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 40), material);
}

function makeSymbol(symbol, material) {
  const group = new THREE.Group();
  const addBar = (width, height, x = 0, y = 0, rotation = 0) => {
    const bar = makeRoundedBox(width, height, 0.14, 0.055, material, 7);
    bar.position.set(x, y, 0.285);
    bar.rotation.z = rotation;
    bar.castShadow = false;
    bar.receiveShadow = false;
    group.add(bar);
  };

  if (symbol === "+") {
    addBar(0.58, 0.14);
    addBar(0.14, 0.58);
  } else if (symbol === "−") {
    addBar(0.58, 0.14);
  } else if (symbol === "×") {
    addBar(0.14, 0.6, 0, 0, Math.PI / 4);
    addBar(0.14, 0.6, 0, 0, -Math.PI / 4);
  } else if (symbol === "=") {
    addBar(0.6, 0.14, 0, 0.16);
    addBar(0.6, 0.14, 0, -0.16);
  }

  return group;
}

function stepSpring(state, target, stiffness, damping, deltaTime) {
  const acceleration = (target - state.value) * stiffness - state.velocity * damping;
  state.velocity += acceleration * deltaTime;
  state.value += state.velocity * deltaTime;
  return state.value;
}

export class VerityRobot {
  constructor({
    renderer = null,
    reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    appearance = VERITY_DEFAULTS.appearance,
    accent = null,
    scale = VERITY_DEFAULTS.scale,
    dark = false,
  } = {}) {
    const named = VERITY_APPEARANCES[appearance] ? appearance : "classic";
    const palette = dark
      ? { ...VERITY_APPEARANCES[named], ...DARK_FINISH[named] }
      : VERITY_APPEARANCES[named];
    this.root = new THREE.Group();
    this.root.name = "VerityRobot";

    /**
     * A short-lived facial reaction, on top of whatever else she is doing.
     *
     * Expressions decay on their own rather than being switched off, so a
     * caller can fire one and forget it: `react("delight")` and she brightens
     * for a beat and settles. `mode` stays the behavioural state; this is the
     * momentary one.
     */
    this.expression = { kind: "neutral", amount: 0, decay: 1.6 };

    /**
     * Where she is deliberately looking, and how much it overrides the
     * ambient pointer-following.
     *
     * Kept separate from `dragRotation` so the two compose instead of
     * fighting: the pointer gives her idle life, `lookAt` aims her at
     * something that just happened, and releasing it hands her back.
     */
    this.gazeTarget = new THREE.Vector2(0, 0);
    this.gazeWeight = 0;
    this.gazeWeightTarget = 0;
    this.floatGroup = new THREE.Group();
    this.root.add(this.floatGroup);

    this.reducedMotion = reducedMotion;
    this.appearance = named;
    this.dark = dark;
    this.palette = palette;
    this.accent = accent ?? palette.accent;
    this.maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

    this.mode = "idle";
    this.audioLevel = 0;
    /**
     * What her lips are asked to do, and what they are currently doing.
     *
     * Two copies because the second chases the first. Whoever is driving the
     * mouth has already smoothed it for their own reasons — the voice analyser
     * damps each channel at a different rate — but poses arrive on somebody
     * else's schedule, and a frame that misses one should carry on rather than
     * freeze. Chasing at a high rate is nearly transparent when poses are
     * arriving and covers for it when they are not.
     */
    this.mouthTarget = { open: 0, round: 0, press: 0, hiss: 0, energy: 0 };
    this.mouthCurrent = { open: 0, round: 0, press: 0, hiss: 0, energy: 0 };
    /** Seconds since the last pose arrived, so a silent driver is noticed. */
    this.mouthPoseAge = Infinity;
    this.outputAudioActive = false;
    this.transcript = "";
    this.printedTranscript = "";
    /**
     * The characters the print head put down this frame.
     *
     * The paper prints at its own pace — a couple of dozen characters a
     * second, which is roughly a speaking rate — while deltas arrive from the
     * network in whatever sized lumps the model felt like. This is the paced
     * stream, and it is what a mouth should be driven from: the letter under
     * the head is the letter she is saying.
     */
    this.justPrinted = "";
    this.pendingReceiptText = "";
    this.printCharacterBudget = 0;
    this.receiptLines = [];
    this.nextReceiptLineId = 1;
    this.forceNewReceiptLine = true;
    this.paperProgress = 0.3;
    this.paperTarget = 0.3;
    this.paperPathLength = 0.72;
    this.maxPaperPathLength = 5.15;
    this.paperFeedDistance = 0;
    this.paperTextTravel = 0;
    this.paperDrawAccumulator = 0;
    this.nextBlinkAt = 2.4 + Math.random() * 2;
    this.blinkStartedAt = -1;
    this.dragRotationTarget = new THREE.Vector2();
    this.dragRotation = new THREE.Vector2();
    this.paperTailSwayX = 0;
    this.paperTailSwayZ = 0;
    this.secondaryMotion = {
      initialized: false,
      previousYaw: 0,
      previousPitch: 0,
      previousRoll: 0,
      previousFloatY: 0,
      previousVerticalVelocity: 0,
      paperYaw: { value: 0, velocity: 0 },
      paperPitch: { value: 0, velocity: 0 },
      paperRoll: { value: 0, velocity: 0 },
      tailX: { value: 0, velocity: 0 },
      tailZ: { value: 0, velocity: 0 },
    };

    this.ivory = roundedMaterial(palette.body, 0.92, 0, {
      specularIntensity: 0.16,
      bumpScale: 0.018,
    });
    this.ivorySide = roundedMaterial(palette.bodySide, 0.93, 0, {
      specularIntensity: 0.14,
      bumpScale: 0.018,
    });
    this.faceRimMaterial = roundedMaterial(palette.faceRim, 0.9, 0, {
      specularIntensity: 0.18,
      bumpScale: 0.012,
    });
    this.faceMaterial = roundedMaterial(palette.face, 0.64, 0, {
      specularIntensity: 0.3,
      bumpScale: 0.006,
      clearcoat: 0.08,
      clearcoatRoughness: 0.72,
    });
    this.keyMaterial = roundedMaterial(palette.key, 0.88, 0, {
      specularIntensity: 0.18,
      bumpScale: 0.015,
    });
    this.purpleMaterial = roundedMaterial(this.accent, 0.84, 0, {
      specularIntensity: 0.22,
      bumpScale: 0.014,
    });
    this.whiteMaterial = roundedMaterial(palette.symbol, 0.82, 0, {
      specularIntensity: 0.18,
      bumpScale: 0.012,
    });
    this.pupilMaterial = roundedMaterial(palette.face, 0.34, 0, {
      specularIntensity: 0.85,
      clearcoat: 0.7,
      clearcoatRoughness: 0.24,
    });

    this.mouthMaterial = roundedMaterial(palette.mouth, 0.82, 0, {
      specularIntensity: 0.16,
      bumpScale: 0.01,
    });

    this.buildBody();
    this.buildPaper();
    this.root.scale.setScalar(scale);
  }

  get object3d() {
    return this.root;
  }

  buildBody() {
    this.body = makeRoundedBox(4.25, 5.4, 1.88, 0.73, this.ivory, 10);
    this.body.position.y = -0.3;
    this.floatGroup.add(this.body);

    // A single softly rounded display sits directly in the ivory shell. Keeping
    // it partially embedded avoids the separate metallic-looking frame from the
    // earlier two-mesh construction.
    this.face = makeRoundedPanel(3.06, 1.46, 0.07, 0.27, this.faceMaterial);
    this.face.position.set(0, 1.19, 0.975);
    this.face.castShadow = false;
    this.face.receiveShadow = false;
    this.floatGroup.add(this.face);

    const eyeGeometry = new THREE.SphereGeometry(0.235, 32, 24);
    /**
     * Eyes with pupils.
     *
     * Two plain white ovals cannot look at anything: they change position, and
     * a viewer reads that as the whole head shifting rather than as attention.
     * A pupil is what makes a gaze legible.
     *
     * The eye is a sphere squashed to (1, 1.16, 0.52), so anything parented to
     * it inherits that squash. A `pupilGroup` carries the inverse, and
     * everything inside it is therefore in round, unsquashed units — which is
     * the only way to reason about where the front surface of the eye is.
     * Nesting the glint under the pupil instead compounded two compensations
     * and threw it a clear unit in front of her face, where it read as a
     * floating white ball rather than a highlight.
     */
    const EYE_RADIUS = 0.235;
    /**
     * A big pupil, filling most of the eye.
     *
     * A small dark bead in a white oval reads as a doll. What makes a face
     * like this likeable is the anime proportion: an iris taking two-thirds of
     * the eye, one large highlight up and to one side, and a smaller one
     * opposite it. The two highlights are what make it look wet rather than
     * printed.
     */
    const PUPIL_RADIUS = EYE_RADIUS * 0.68;

    this.eyes = [-0.7, 0.7].map((x) => {
      const eye = new THREE.Mesh(eyeGeometry, this.whiteMaterial);
      eye.scale.set(1, 1.16, 0.52);
      eye.position.set(x, 1.26, 1.09);
      eye.userData.restX = x;
      eye.castShadow = true;
      eye.renderOrder = 4;

      /*
       * The eye is squashed to (1, 1.16, 0.52), so anything parented to it
       * inherits that squash. This group carries the inverse once, and
       * everything inside it is therefore in round, unsquashed units — which
       * is the only way to reason about where the front of the eye is.
       */
      const pupilGroup = new THREE.Group();
      pupilGroup.scale.set(1, 1 / 1.16, 1 / 0.52);
      eye.add(pupilGroup);

      // A lens rather than a ball: flattened onto the front of the eye so it
      // sits on the surface instead of bulging out of it.
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(PUPIL_RADIUS, 28, 20),
        this.pupilMaterial,
      );
      pupil.scale.z = 0.3;
      pupil.position.z = EYE_RADIUS * 0.52 * 0.92;
      pupil.renderOrder = 5;
      pupilGroup.add(pupil);

      const highlight = (radius, offsetX, offsetY, forward) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 14, 12),
          this.whiteMaterial,
        );
        mesh.scale.z = 0.5;
        mesh.position.set(offsetX, offsetY, pupil.position.z + forward);
        mesh.renderOrder = 6;
        pupilGroup.add(mesh);
        return mesh;
      };

      // The big one up and to the left, the small one opposite. Two is what
      // reads as wet; one reads as a sticker.
      highlight(PUPIL_RADIUS * 0.34, -PUPIL_RADIUS * 0.34, PUPIL_RADIUS * 0.36, 0.02);
      highlight(PUPIL_RADIUS * 0.17, PUPIL_RADIUS * 0.36, -PUPIL_RADIUS * 0.34, 0.018);

      eye.userData.pupilGroup = pupilGroup;
      this.floatGroup.add(eye);
      return eye;
    });

    this.mouthShape = createVerityMouth(this.mouthMaterial);
    this.mouth = this.mouthShape.object3d;
    this.mouth.position.set(0, 1.08, 1.09);
    this.mouth.renderOrder = 4;
    this.floatGroup.add(this.mouth);

    const keySpecs = [
      { symbol: "+", x: -0.76, y: -0.38, material: this.keyMaterial },
      { symbol: "−", x: 0.76, y: -0.38, material: this.keyMaterial },
      { symbol: "×", x: -0.76, y: -1.72, material: this.keyMaterial },
      { symbol: "=", x: 0.76, y: -1.72, material: this.purpleMaterial },
    ];

    this.keys = keySpecs.map(({ symbol, x, y, material }) => {
      const group = new THREE.Group();
      const key = makeRoundedBox(1.15, 1.04, 0.5, 0.27, material, 8);
      key.castShadow = false;
      const label = makeSymbol(symbol, this.whiteMaterial);
      label.position.set(0, 0, 0);
      group.add(key, label);
      group.position.set(x, y, 1.12);
      this.floatGroup.add(group);
      return group;
    });

    // Per-key press springs. Driven by pressKey(), released on their own.
    this.keyPress = this.keys.map(() => ({ amount: 0, velocity: 0 }));

    this.hands = [-1, 1].map((side) => {
      const hand = makeSoftCylinder(0.28, 0.33, 0.055, this.ivorySide);
      hand.rotation.z = Math.PI / 2;
      hand.position.set(side * 2.19, 0.75, 0.34);
      hand.castShadow = false;
      hand.receiveShadow = true;
      this.floatGroup.add(hand);
      return hand;
    });

    const slotMaterial = roundedMaterial(this.palette.slot, 0.94, 0, {
      specularIntensity: 0.1,
      bumpScale: 0.008,
    });
    this.slot = makeRoundedBox(1.98, 0.16, 0.5, 0.065, slotMaterial, 8);
    this.slot.position.set(0, 2.46, 0.015);
    this.slot.castShadow = false;
    this.slot.receiveShadow = false;
    this.floatGroup.add(this.slot);

    this.paperGuides = [-0.94, 0.94].map((x) => {
      const guide = makeRoundedBox(0.18, 0.24, 0.4, 0.06, this.faceRimMaterial, 8);
      guide.position.set(x, 2.49, 0.09);
      guide.castShadow = false;
      guide.receiveShadow = true;
      this.floatGroup.add(guide);
      return guide;
    });
    this.paperRollers = [];

    if (this.palette.earrings) this.buildEarrings();
  }

  buildEarrings() {
    const earringMaterial = roundedMaterial(this.accent, 0.86, 0, {
      specularIntensity: 0.18,
      bumpScale: 0.012,
    });
    const studGeometry = new THREE.SphereGeometry(0.055, 18, 14);
    const dollarCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.095, 0.14, 0),
      new THREE.Vector3(0.025, 0.175, 0),
      new THREE.Vector3(-0.09, 0.12, 0),
      new THREE.Vector3(-0.08, 0.035, 0),
      new THREE.Vector3(0.075, -0.025, 0),
      new THREE.Vector3(0.085, -0.105, 0),
      new THREE.Vector3(-0.025, -0.17, 0),
      new THREE.Vector3(-0.105, -0.135, 0),
    ], false, "catmullrom", 0.5);
    const dollarCurveGeometry = new THREE.TubeGeometry(
      dollarCurve,
      32,
      0.026,
      8,
      false,
    );

    this.earrings = [-1, 1].map((side) => {
      const earring = new THREE.Group();
      earring.name = side < 0 ? "VerityLeftEarring" : "VerityRightEarring";

      const stud = new THREE.Mesh(studGeometry, earringMaterial);
      stud.position.y = 0.11;
      stud.castShadow = true;

      const connector = makeRoundedBox(0.035, 0.09, 0.055, 0.015, earringMaterial, 5);
      connector.position.y = 0.045;
      connector.castShadow = true;

      const dollarSign = new THREE.Group();
      const dollarCurveMesh = new THREE.Mesh(dollarCurveGeometry, earringMaterial);
      dollarCurveMesh.castShadow = true;
      const dollarStroke = makeRoundedBox(0.036, 0.42, 0.07, 0.016, earringMaterial, 5);
      dollarStroke.position.z = -0.015;
      dollarStroke.castShadow = true;
      dollarSign.add(dollarCurveMesh, dollarStroke);
      dollarSign.position.y = -0.19;
      dollarSign.scale.setScalar(0.92);

      const charmPivot = new THREE.Group();
      charmPivot.position.y = 0.045;
      charmPivot.add(dollarSign);

      earring.add(stud, connector, charmPivot);
      earring.position.set(side * 2.2, 0.38, 0.62);
      earring.userData.side = side;
      earring.userData.charmPivot = charmPivot;
      earring.userData.swing = { value: 0, velocity: 0 };
      earring.userData.depthSwing = { value: 0, velocity: 0 };
      this.floatGroup.add(earring);
      return earring;
    });
  }

  buildPaper() {
    const width = 1.75;
    const height = 2.55;
    const geometry = new THREE.PlaneGeometry(width, height, 10, 40);
    geometry.translate(0, height / 2, 0);
    this.paperWidth = width;
    this.paperHeight = height;
    this.paperBendStart = 0.84;
    this.paperBendRadius = 0.62;
    this.paperBasePositions = geometry.attributes.position.array.slice();

    this.paperCanvas = document.createElement("canvas");
    this.paperCanvas.width = 512;
    this.paperCanvas.height = 768;
    this.paperContext = this.paperCanvas.getContext("2d");
    this.paperTexture = new THREE.CanvasTexture(this.paperCanvas);
    this.paperTexture.colorSpace = THREE.SRGBColorSpace;
    this.paperTexture.anisotropy = this.maxAnisotropy;

    const material = new THREE.MeshStandardMaterial({
      map: this.paperTexture,
      color: this.palette.paper,
      roughness: 0.94,
      metalness: 0,
      side: THREE.FrontSide,
    });

    this.paper = new THREE.Mesh(geometry, material);
    this.paper.position.set(0, 2.47, -0.08);
    this.paper.castShadow = false;
    this.paper.renderOrder = -1;
    this.paper.frustumCulled = false;

    const paperBackMaterial = new THREE.MeshStandardMaterial({
      color: this.palette.paperBack,
      roughness: 0.96,
      metalness: 0,
      side: THREE.BackSide,
    });
    this.paperBack = new THREE.Mesh(geometry, paperBackMaterial);
    this.paperBack.castShadow = false;
    this.paperBack.frustumCulled = false;
    this.paperBack.renderOrder = -2;
    this.paper.add(this.paperBack);

    const paperEdgeMaterial = new THREE.LineBasicMaterial({
      color: this.palette.paperEdge,
      transparent: true,
      opacity: 0.72,
    });
    this.paperEdges = [-1, 1].map((side) => {
      const edge = new THREE.Line(new THREE.BufferGeometry(), paperEdgeMaterial);
      edge.userData.side = side;
      edge.frustumCulled = false;
      this.paper.add(edge);
      return edge;
    });
    this.paperTopEdge = new THREE.Line(new THREE.BufferGeometry(), paperEdgeMaterial);
    this.paperTopEdge.frustumCulled = false;
    this.paper.add(this.paperTopEdge);

    this.floatGroup.add(this.paper);
    this.updatePaperGeometry(this.paperPathLength);
    this.drawPaper();
  }

  mapPaperPosition(x, pathY) {
    if (pathY <= this.paperBendStart) return new THREE.Vector3(x, pathY, 0);
    const distanceIntoBend = pathY - this.paperBendStart;
    const quarterTurnLength = this.paperBendRadius * Math.PI / 2;
    const bendDistance = Math.min(distanceIntoBend, quarterTurnLength);
    const bendAngle = bendDistance / this.paperBendRadius;
    const trailingDistance = Math.max(0, distanceIntoBend - quarterTurnLength);
    const bendProgress = bendAngle / (Math.PI / 2);
    const fallRadius = 2.2;
    const backwardTravel = trailingDistance > 0
      ? fallRadius * (1 - Math.exp(-trailingDistance / fallRadius))
      : 0;
    const gravityDrop = (trailingDistance - backwardTravel) * 1.25;
    const looseLength = Math.max(this.paperPathLength - this.paperBendStart, 0.4);
    const tailProgress = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp(distanceIntoBend / looseLength, 0, 1),
      0,
      1,
    );
    return new THREE.Vector3(
      x * (1 - 0.028 * bendProgress) + this.paperTailSwayX * tailProgress,
      this.paperBendStart + Math.sin(bendAngle) * this.paperBendRadius - gravityDrop,
      -(1 - Math.cos(bendAngle)) * this.paperBendRadius
        - backwardTravel
        + this.paperTailSwayZ * tailProgress,
    );
  }

  updatePaperGeometry(visibleLength) {
    const clampedLength = THREE.MathUtils.clamp(visibleLength, 0.2, this.maxPaperPathLength);
    const positions = this.paper.geometry.attributes.position;

    for (let index = 0; index < positions.count; index += 1) {
      const sourceIndex = index * 3;
      const baseX = this.paperBasePositions[sourceIndex];
      const normalizedY = this.paperBasePositions[sourceIndex + 1] / this.paperHeight;
      const pathY = normalizedY * clampedLength;
      const mapped = this.mapPaperPosition(baseX, pathY);
      positions.setXYZ(index, mapped.x, mapped.y, mapped.z);
    }
    positions.needsUpdate = true;
    this.paper.geometry.computeVertexNormals();

    this.paperEdges.forEach((edge) => {
      const edgePoints = Array.from({ length: 41 }, (_, index) => {
        const pathY = clampedLength * index / 40;
        return this.mapPaperPosition(edge.userData.side * this.paperWidth / 2, pathY);
      });
      edge.geometry.setFromPoints(edgePoints);
    });
    const topLeft = this.mapPaperPosition(-this.paperWidth / 2, clampedLength);
    const topRight = this.mapPaperPosition(this.paperWidth / 2, clampedLength);
    this.paperTopEdge.geometry.setFromPoints([topLeft, topRight]);
  }

  wrapTranscript(text, maxCharacters = 24) {
    const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });

    if (line) lines.push(line);
    return lines.slice(-12);
  }

  drawPaper() {
    const context = this.paperContext;
    const { width, height } = this.paperCanvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = this.palette.paperCss;
    context.fillRect(0, 0, width, height);

    const curlDepthShade = context.createLinearGradient(0, 0, 0, height * 0.52);
    curlDepthShade.addColorStop(0, "rgba(91, 87, 78, 0.17)");
    curlDepthShade.addColorStop(0.34, "rgba(112, 106, 96, 0.08)");
    curlDepthShade.addColorStop(1, `rgba(${this.palette.paperRgb}, 0)`);
    context.fillStyle = curlDepthShade;
    context.fillRect(0, 0, width, height * 0.54);

    const curlSideShade = context.createLinearGradient(0, 0, width, 0);
    curlSideShade.addColorStop(0, `rgba(${this.palette.paperRgb}, 0)`);
    curlSideShade.addColorStop(0.72, `rgba(${this.palette.paperRgb}, 0)`);
    curlSideShade.addColorStop(1, "rgba(82, 78, 70, 0.07)");
    context.fillStyle = curlSideShade;
    context.fillRect(0, 0, width, height * 0.54);

    const paperBandOffset = -(this.paperFeedDistance % 28);
    context.fillStyle = "rgba(74, 70, 62, 0.05)";
    for (let y = paperBandOffset; y < height; y += 28) {
      context.fillRect(24, y, width - 48, 1);
    }

    context.strokeStyle = "rgba(91, 76, 176, 0.16)";
    context.lineWidth = 2;
    context.setLineDash([8, 10]);
    context.beginPath();
    context.moveTo(55, 55);
    context.lineTo(width - 55, 55);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#282c3d";
    context.font = "500 28px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textBaseline = "top";

    const maxCharacters = 24;
    const lineHeight = 38;
    const glyphWidth = context.measureText("M").width;
    const textColumnWidth = glyphWidth * maxCharacters;
    const textX = (width - textColumnWidth) / 2;
    const printHeadY = height - 84;
    this.receiptLines.forEach((line) => {
      const lineY = printHeadY - (this.paperFeedDistance - line.feedPosition);
      if (lineY > -lineHeight && lineY < height) {
        context.fillText(line.text, textX, lineY);
      }
    });

    const currentLine = this.receiptLines.at(-1);
    this.paperTextTravel = currentLine
      ? Math.max(0, this.paperFeedDistance - currentLine.feedPosition)
      : 0;

    if (this.mode === "speaking" && currentLine) {
      const cursorY = printHeadY
        - (this.paperFeedDistance - currentLine.feedPosition)
        + lineHeight - 3;
      const cursorX = textX + Math.min(currentLine.text.length, maxCharacters) * glyphWidth;
      context.fillStyle = this.accent;
      context.fillRect(cursorX, cursorY, 14, 3);
    }

    this.paperTexture.needsUpdate = true;
  }

  beginResponse() {
    if (this.transcript.trim()) this.transcript += "\n";
    this.pendingReceiptText = this.receiptLines.length ? "\n" : "";
    this.printCharacterBudget = 0;
    this.setMode("speaking");
    this.paperTarget = Math.max(this.paperTarget, 0.54);
    this.drawPaper();
  }

  appendTranscript(delta) {
    if (!delta) return;
    this.transcript = (this.transcript + delta).slice(-650);
    this.pendingReceiptText += delta;
    const lineCount = this.wrapTranscript(this.transcript).length;
    this.paperTarget = THREE.MathUtils.clamp(0.42 + lineCount * 0.075, 0.5, 1);
  }

  printReceiptText(text) {
    if (!text) return;
    this.printedTranscript = (this.printedTranscript + text).slice(-650);

    for (const character of text) {
      if (character === "\r") continue;
      if (character === "\n") {
        this.forceNewReceiptLine = true;
        continue;
      }

      let currentLine = this.receiptLines.at(-1);
      if (this.forceNewReceiptLine || !currentLine || currentLine.text.length >= 24) {
        currentLine = {
          id: this.nextReceiptLineId,
          text: "",
          feedPosition: this.paperFeedDistance,
        };
        this.nextReceiptLineId += 1;
        this.receiptLines.push(currentLine);
        this.forceNewReceiptLine = false;
        if (this.receiptLines.length > 36) this.receiptLines.shift();
      }

      if (character === " " && currentLine.text.length === 0) continue;
      currentLine.text += character;
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.drawPaper();
  }

  setAudioLevel(level) {
    this.audioLevel = THREE.MathUtils.clamp(level, 0, 1);
  }

  setOutputAudioActive(active) {
    this.outputAudioActive = active;
  }

  /**
   * Tell her mouth what shape to be in.
   *
   * `open`, `round`, `press` and `hiss` are each 0..1 and compose freely; see
   * mouthShape.js for what each does. Call it every frame while she is
   * speaking. Stop calling it and she returns to her resting smile on her own,
   * so nothing has to remember to switch her off.
   */
  setMouthPose(pose) {
    const clamp = (value) => THREE.MathUtils.clamp(value ?? 0, 0, 1);
    this.mouthTarget.open = clamp(pose?.open);
    this.mouthTarget.round = clamp(pose?.round);
    this.mouthTarget.press = clamp(pose?.press);
    this.mouthTarget.hiss = clamp(pose?.hiss);
    this.mouthTarget.energy = clamp(pose?.energy);
    this.mouthPoseAge = 0;
  }

  /**
   * Press one of her keys.
   *
   * `index` is the keypad in reading order: +, −, ×, =. The key travels and
   * springs back; the caller supplies the sound and, if it wants one, the
   * reaction.
   */
  pressKey(index) {
    const spring = this.keyPress?.[index];
    if (!spring) return false;
    spring.amount = 1;
    spring.velocity = 0;
    return true;
  }

  /** How far a key is currently depressed, 0–1. For a caller driving sound. */
  keyPressAmount(index) {
    return this.keyPress?.[index]?.amount ?? 0;
  }

  /**
   * React for a moment.
   *
   * `delight` brightens and squints, `concern` narrows and tilts, `nod` is a
   * short agreement. All decay on their own.
   */
  react(kind = "delight", strength = 1) {
    this.expression = {
      kind,
      amount: THREE.MathUtils.clamp(strength, 0, 1),
      decay: kind === "nod" ? 2.4 : 1.6,
    };
  }

  /**
   * Look at something.
   *
   * `pitch` and `yaw` are in the same units as `setDragRotation`. `weight`
   * decides how much of her attention it takes from the pointer; passing 0
   * (or calling `releaseGaze`) hands her back.
   */
  lookAt(pitch, yaw, weight = 1) {
    this.gazeTarget.set(pitch, yaw);
    this.gazeWeightTarget = THREE.MathUtils.clamp(weight, 0, 1);
  }

  releaseGaze() {
    this.gazeWeightTarget = 0;
  }

  setDragRotation(pitch, yaw) {
    this.dragRotationTarget.set(pitch, yaw);
  }

  resetRotation() {
    this.setDragRotation(0, 0);
  }

  clearTranscript() {
    this.transcript = "";
    this.printedTranscript = "";
    this.pendingReceiptText = "";
    this.printCharacterBudget = 0;
    this.receiptLines = [];
    this.nextReceiptLineId = 1;
    this.forceNewReceiptLine = true;
    this.paperTarget = 0.3;
    this.paperPathLength = 0.72;
    this.updatePaperGeometry(this.paperPathLength);
    this.paperTextTravel = 0;
    this.drawPaper();
  }

  getState() {
    return {
      mode: this.mode,
      appearance: this.appearance,
      audioLevel: Number(this.audioLevel.toFixed(3)),
      transcript: this.transcript,
      paperFeedDistance: Number(this.paperFeedDistance.toFixed(2)),
      receiptLines: this.receiptLines.map((line) => ({
        id: line.id,
        text: line.text,
        feedPosition: line.feedPosition,
      })),
    };
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();

    this.root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      objectMaterials.filter(Boolean).forEach((material) => materials.add(material));
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.paperTexture.dispose();
    this.root.removeFromParent();
  }

  updateSecondaryMotion(deltaTime, motionScale) {
    const state = this.secondaryMotion;
    const yaw = this.floatGroup.rotation.y;
    const pitch = this.floatGroup.rotation.x;
    const roll = this.floatGroup.rotation.z;
    const floatY = this.floatGroup.position.y;

    if (!state.initialized) {
      state.initialized = true;
      state.previousYaw = yaw;
      state.previousPitch = pitch;
      state.previousRoll = roll;
      state.previousFloatY = floatY;
      return;
    }

    const safeDelta = Math.max(deltaTime, 1 / 240);
    const yawVelocity = THREE.MathUtils.clamp(
      (yaw - state.previousYaw) / safeDelta,
      -5,
      5,
    );
    const pitchVelocity = THREE.MathUtils.clamp(
      (pitch - state.previousPitch) / safeDelta,
      -4,
      4,
    );
    const rollVelocity = THREE.MathUtils.clamp(
      (roll - state.previousRoll) / safeDelta,
      -3,
      3,
    );
    const verticalVelocity = THREE.MathUtils.clamp(
      (floatY - state.previousFloatY) / safeDelta,
      -2,
      2,
    );
    const verticalAcceleration = THREE.MathUtils.clamp(
      (verticalVelocity - state.previousVerticalVelocity) / safeDelta,
      -8,
      8,
    );

    state.previousYaw = yaw;
    state.previousPitch = pitch;
    state.previousRoll = roll;
    state.previousFloatY = floatY;
    state.previousVerticalVelocity = verticalVelocity;

    const hangingAmount = THREE.MathUtils.smoothstep(
      this.paperPathLength,
      this.paperBendStart,
      this.maxPaperPathLength,
    );
    const looseness = THREE.MathUtils.lerp(0.38, 1, hangingAmount);
    const paperStiffness = THREE.MathUtils.lerp(32, 18, hangingAmount);
    const paperDamping = THREE.MathUtils.lerp(9.5, 6.5, hangingAmount);
    const forceScale = motionScale;

    stepSpring(
      state.paperYaw,
      THREE.MathUtils.clamp(-yawVelocity * 0.055 * looseness * forceScale, -0.18, 0.18),
      paperStiffness,
      paperDamping,
      safeDelta,
    );
    stepSpring(
      state.paperPitch,
      THREE.MathUtils.clamp(
        (-pitchVelocity * 0.045 + verticalAcceleration * 0.0025)
          * looseness
          * forceScale,
        -0.12,
        0.12,
      ),
      paperStiffness,
      paperDamping,
      safeDelta,
    );
    stepSpring(
      state.paperRoll,
      THREE.MathUtils.clamp(
        (-roll * 1.5 - rollVelocity * 0.09) * looseness * forceScale,
        -0.13,
        0.13,
      ),
      paperStiffness,
      paperDamping,
      safeDelta,
    );
    this.paperTailSwayX = stepSpring(
      state.tailX,
      THREE.MathUtils.clamp(-yawVelocity * 0.12 * looseness * forceScale, -0.3, 0.3),
      THREE.MathUtils.lerp(15, 8, hangingAmount),
      THREE.MathUtils.lerp(6, 4.5, hangingAmount),
      safeDelta,
    );
    this.paperTailSwayZ = stepSpring(
      state.tailZ,
      THREE.MathUtils.clamp(
        (-pitchVelocity * 0.08 + verticalAcceleration * 0.004)
          * looseness
          * forceScale,
        -0.2,
        0.2,
      ),
      THREE.MathUtils.lerp(15, 8, hangingAmount),
      THREE.MathUtils.lerp(6, 4.5, hangingAmount),
      safeDelta,
    );

    this.earrings?.forEach((earring) => {
      const swingTarget = THREE.MathUtils.clamp(
        (-roll * 1.8 - rollVelocity * 0.14) * forceScale,
        -0.34,
        0.34,
      );
      const depthTarget = THREE.MathUtils.clamp(
        (-yawVelocity * 0.075 - pitchVelocity * 0.035) * forceScale,
        -0.27,
        0.27,
      );
      const swing = stepSpring(
        earring.userData.swing,
        swingTarget,
        30,
        7.2,
        safeDelta,
      );
      const depthSwing = stepSpring(
        earring.userData.depthSwing,
        depthTarget,
        27,
        7,
        safeDelta,
      );
      earring.userData.charmPivot.rotation.z = swing;
      earring.userData.charmPivot.rotation.x = depthSwing;
    });
  }

  update(time, deltaTime) {
    this.justPrinted = "";
    const motionScale = this.reducedMotion ? 0.18 : 1;
    const speakingEnergy = this.mode === "speaking" ? 0.34 : 0;
    const listeningEnergy = this.mode === "listening" ? 0.12 : 0;
    const energy = speakingEnergy + listeningEnergy;

    // Deliberate gaze blends over the ambient pointer target rather than
    // replacing it, so handing attention back is a fade and not a snap.
    this.gazeWeight = THREE.MathUtils.damp(
      this.gazeWeight,
      this.gazeWeightTarget,
      4.5,
      deltaTime,
    );
    const aimX = THREE.MathUtils.lerp(
      this.dragRotationTarget.x,
      this.gazeTarget.x,
      this.gazeWeight,
    );
    const aimY = THREE.MathUtils.lerp(
      this.dragRotationTarget.y,
      this.gazeTarget.y,
      this.gazeWeight,
    );

    this.dragRotation.x = THREE.MathUtils.damp(this.dragRotation.x, aimX, 11, deltaTime);
    this.dragRotation.y = THREE.MathUtils.damp(this.dragRotation.y, aimY, 11, deltaTime);

    // Expressions fade rather than being switched off, so a caller can fire
    // one and forget it.
    if (this.expression.amount > 0) {
      this.expression.amount = Math.max(
        0,
        this.expression.amount - deltaTime * this.expression.decay,
      );
    }
    const delight = this.expression.kind === "delight" ? this.expression.amount : 0;
    const concern = this.expression.kind === "concern" ? this.expression.amount : 0;
    const nod = this.expression.kind === "nod" ? this.expression.amount : 0;
    const floatY = Math.sin(time * (0.7 + energy * 0.08)) * (0.052 + energy * 0.01);
    this.floatGroup.position.y = floatY * motionScale;
    this.floatGroup.rotation.z =
      Math.sin(time * 0.52) * 0.014 * motionScale;
    /*
     * Pitch: positive means she is looking *down*.
     *
     * Rotating about +X by a positive angle sends the face normal (0, 0, 1) to
     * (0, -sin, cos) — downward. So this adds, and the pupils, which move to
     * `-dragRotation.x`, travel down with it. Everything upstream — the
     * pointer, `lookAt` — uses the same sign, so screen-down is look-down all
     * the way through.
     */
    this.floatGroup.rotation.x =
      Math.sin(time * 0.42 + 1.3) * 0.01 * motionScale
      + this.dragRotation.x
      + Math.sin(nod * Math.PI) * 0.14;
    this.floatGroup.rotation.y = this.dragRotation.y;
    this.updateSecondaryMotion(deltaTime, motionScale);

    const breath = 1 + Math.sin(time * 1.15) * 0.004 * motionScale;
    this.body.scale.set(breath, breath, breath);

    /*
     * The mouth.
     *
     * Whoever is driving it hands over a pose; if nobody has for a moment, the
     * level alone stands in, which keeps the character usable on its own and
     * covers the gap between a driver stopping and her settling. The fallback
     * is deliberately the old behaviour — aperture from loudness and nothing
     * else — so it degrades to what was here before rather than to a freeze.
     */
    this.mouthPoseAge += deltaTime;
    if (this.mouthPoseAge > 0.35) {
      this.mouthTarget.open = Math.min(1, this.audioLevel * 1.15);
      this.mouthTarget.round = 0;
      this.mouthTarget.press = 0;
      this.mouthTarget.hiss = 0;
      this.mouthTarget.energy = Math.min(1, this.audioLevel * 1.6);
    }

    for (const channel of ["open", "round", "press", "hiss", "energy"]) {
      this.mouthCurrent[channel] = THREE.MathUtils.damp(
        this.mouthCurrent[channel],
        this.mouthTarget[channel] * motionScale,
        34,
        deltaTime,
      );
    }

    // Delight is a wider grin, concern a flatter one. The shape composes them
    // with whatever her lips are doing rather than overriding it.
    this.mouthShape.setShape({
      ...this.mouthCurrent,
      smile: THREE.MathUtils.clamp(1 + delight * 0.42 - concern * 0.66, 0, 1.5),
    });

    // Her jaw takes the whole mouth down a little as it opens.
    this.mouth.position.y = THREE.MathUtils.damp(
      this.mouth.position.y,
      1.08 - this.mouthCurrent.open * 0.036,
      22,
      deltaTime,
    );
    this.mouth.rotation.z = THREE.MathUtils.damp(
      this.mouth.rotation.z,
      concern * 0.16,
      12,
      deltaTime,
    );

    if (time >= this.nextBlinkAt && this.blinkStartedAt < 0) {
      this.blinkStartedAt = time;
    }

    let blink = 1;
    if (this.blinkStartedAt >= 0) {
      const blinkTime = (time - this.blinkStartedAt) / 0.22;
      blink = blinkTime < 0.5
        ? THREE.MathUtils.lerp(1, 0.08, blinkTime * 2)
        : THREE.MathUtils.lerp(0.08, 1, (blinkTime - 0.5) * 2);
      if (blinkTime >= 1) {
        this.blinkStartedAt = -1;
        this.nextBlinkAt = time + 2.8 + Math.random() * 4.8;
        blink = 1;
      }
    }

    // A squint is what actually reads as a smile on a face with no cheeks.
    const squint = 1 - delight * 0.42 - concern * 0.14;

    /**
     * Where the pupils point.
     *
     * `dragRotation` is where the head has turned to, and the pupil leads it —
     * she looks with her eyes slightly before her head arrives, which is what
     * makes a gaze read as intent rather than as a head on a spring.
     *
     * Same sign as the eye's own drift, and emphatically so: positive yaw is
     * her looking right, and a pupil that slid left instead was the single
     * most unsettling thing about her.
     */
    /*
     * Clamped as a vector, not per axis.
     *
     * Clamping x and y separately allows a diagonal of `reach * sqrt(2)`,
     * which for a pupil this large puts the corner of her gaze outside the
     * white. Scaling the whole offset keeps the pupil on the eye in every
     * direction and preserves the angle she is looking in.
     */
    let pupilX = this.dragRotation.y * 0.32;
    let pupilY = -this.dragRotation.x * 0.34;
    const reach = Math.hypot(pupilX, pupilY);
    if (reach > EYE_RADIUS_REACH) {
      pupilX *= EYE_RADIUS_REACH / reach;
      pupilY *= EYE_RADIUS_REACH / reach;
    }

    this.eyes.forEach((eye, index) => {
      eye.scale.y = 1.24 * blink * squint;

      const pupils = eye.userData.pupilGroup;
      if (pupils) {
        pupils.position.x = THREE.MathUtils.damp(pupils.position.x, pupilX, 13, deltaTime);
        pupils.position.y = THREE.MathUtils.damp(pupils.position.y, pupilY, 13, deltaTime);
      }
      eye.position.x = THREE.MathUtils.damp(
        eye.position.x,
        eye.userData.restX + this.dragRotation.y * 0.075,
        14,
        deltaTime,
      );
      eye.position.y = THREE.MathUtils.damp(
        eye.position.y,
        1.26 - this.dragRotation.x * 0.1
          + Math.sin(time * 0.8 + index * 0.25) * 0.008 * motionScale,
        14,
        deltaTime,
      );
    });

    this.keys.forEach((key, index) => {
      const keyPulse = this.mode === "thinking" && index === 3
        ? Math.sin(time * 3.6) * 0.025
        : 0;

      // Critically damped: the key drops on press and rises without wobbling,
      // which is what a real key does and what the sound expects.
      const spring = this.keyPress[index];
      if (spring.amount > 0 || spring.velocity !== 0) {
        spring.velocity += (0 - spring.amount) * 260 * deltaTime;
        spring.velocity *= Math.exp(-22 * deltaTime);
        spring.amount = Math.max(0, spring.amount + spring.velocity * deltaTime);
        if (spring.amount < 0.001 && Math.abs(spring.velocity) < 0.01) {
          spring.amount = 0;
          spring.velocity = 0;
        }
      }

      key.position.z = 0.96 + keyPulse - spring.amount * 0.22;
    });

    if (this.outputAudioActive) {
      this.paperFeedDistance += deltaTime * (22 + this.audioLevel * 16);
      this.paperPathLength = Math.min(
        this.maxPaperPathLength,
        this.paperPathLength + deltaTime * (0.2 + this.audioLevel * 0.08),
      );
      const printRate = 16 + THREE.MathUtils.clamp(this.pendingReceiptText.length / 120, 0, 1) * 8;
      this.printCharacterBudget = Math.min(
        this.printCharacterBudget + deltaTime * printRate,
        8,
      );
      const printableCharacters = Math.min(
        Math.floor(this.printCharacterBudget),
        this.pendingReceiptText.length,
      );
      if (printableCharacters > 0) {
        this.justPrinted = this.pendingReceiptText.slice(0, printableCharacters);
        this.printReceiptText(this.justPrinted);
        this.pendingReceiptText = this.pendingReceiptText.slice(printableCharacters);
        this.printCharacterBudget -= printableCharacters;
      }
      this.paperDrawAccumulator += deltaTime;
      if (this.paperDrawAccumulator >= 1 / 30) {
        this.paperDrawAccumulator = 0;
        this.drawPaper();
      }
      this.paperProgress = THREE.MathUtils.damp(
        this.paperProgress,
        this.paperTarget,
        2.5,
        deltaTime,
      );
    }
    this.paper.scale.y = 1;
    this.updatePaperGeometry(this.paperPathLength);
    const feedLift = this.outputAudioActive ? (this.paperFeedDistance % 18) / 18 * 0.022 : 0;
    this.paper.position.y = THREE.MathUtils.damp(
      this.paper.position.y,
      2.47 + feedLift,
      14,
      deltaTime,
    );
    this.paperRollers.forEach((roller) => {
      roller.rotation.z = this.paperFeedDistance * 0.085 * roller.userData.direction;
    });

    const paperFlutter = this.outputAudioActive
      ? Math.sin(time * 4.4) * (0.004 + this.audioLevel * 0.009) * motionScale
      : 0;
    this.paper.rotation.x = this.secondaryMotion.paperPitch.value;
    this.paper.rotation.y = this.secondaryMotion.paperYaw.value;
    this.paper.rotation.z = this.secondaryMotion.paperRoll.value + paperFlutter;
  }
}
