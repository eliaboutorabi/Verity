import * as THREE from "three";

/**
 * Her mouth, as a shape rather than a decoration.
 *
 * What was here before was one tube bent into a smile, scaled on Y by the
 * loudness of the room. That can only ever do one thing: get taller. It cannot
 * open, it cannot purse, it cannot narrow, and so every word looked like the
 * same word.
 *
 * This is two lips. An upper and a lower line are drawn across the mouth from
 * corner to corner, and the gap between them is the aperture; each line is
 * swept into a half-round stroke so it still catches light the way the tube
 * did. At rest the gap is zero, the two strokes meet edge to edge, and what
 * you see is exactly the smile that was there before — the old shape is the
 * closed state of the new one, which is the only way to add a mouth to a face
 * people already like.
 *
 * The parameters are the ones a mouth actually has, and they compose: she can
 * be open and rounded, or narrow and hissing, or smiling with her mouth shut.
 * Nothing here knows what a phoneme is; see client/lipsync.ts for what decides
 * the numbers.
 */

/** Corner to corner, before rounding narrows it. */
const HALF_WIDTH = 0.2;
/** Where the corners sit, relative to the mouth's own origin. */
const CORNER_Y = 0.03;
/** How far the centre of a full smile drops below its corners. */
const DIP = 0.1;
/** Thickness of one lip stroke. Two of them, back to back, is the old tube. */
const STROKE = 0.035;
/** How far the stroke stands off the face, so it rounds instead of printing. */
const DEPTH = 0.03;
/** The widest the gap between the lips ever gets. */
const MAX_APERTURE = 0.3;

/** Samples along each lip, corner to corner. Enough that no facet shows. */
const ALONG = 56;
/** Samples across a lip's half-round section. */
const ACROSS = 5;

/**
 * The mouth's controls.
 *
 * @typedef {object} MouthShape
 * @property {number} open   0 shut, 1 as wide as her jaw goes.
 * @property {number} round  0 spread across her face, 1 pursed to a small O.
 * @property {number} press  0 relaxed, 1 lips squeezed flat together.
 * @property {number} hiss   0 open, 1 drawn into the slit of a sibilant.
 * @property {number} energy 0 silent, 1 speaking at full tilt.
 * @property {number} smile  0 a flat line, 1 her resting grin.
 */

/** @type {MouthShape} */
export const MOUTH_SHAPE_REST = Object.freeze({
  open: 0,
  round: 0,
  press: 0,
  hiss: 0,
  energy: 0,
  smile: 1,
});

/** How much of the half-width the corners spend closing. */
const SEAL = 0.3;

/**
 * How far open the mouth is at `u`, where u runs -1 to 1 across it.
 *
 * An ellipse times a seal, because neither alone works. The ellipse gives the
 * round, full middle that makes an open mouth look like a mouth; on its own it
 * arrives at the corner with a vertical tangent, so the lips visibly come apart
 * and get pinched back together over a single segment. A super-ellipse fixes
 * the corner and turns the middle into a funnel. Multiplying the ellipse by a
 * smoothstep that closes over the outer third keeps the roundness and lands the
 * two lips into each other with matching slopes.
 */
function apertureAt(u) {
  const ellipse = Math.sqrt(Math.max(0, 1 - u * u));
  const t = Math.min(1, (1 - Math.abs(u)) / SEAL);
  return ellipse * t * t * (3 - 2 * t);
}

/**
 * The height of one lip line at `u`.
 *
 * `mid` is the smile itself: a parabola hung between the two corners. The lips
 * open away from it, and by unequal amounts — the jaw takes the lower lip down
 * about twice as far as the upper lip comes up, which is what stops an open
 * mouth from looking like a surprised circle.
 */
function lipHeight(u, mid, aperture, upper) {
  return mid + (upper ? aperture * 0.34 : -aperture * 0.66) * apertureAt(u);
}

/**
 * Builds the mouth once and lets a caller keep re-posing it.
 *
 * The topology never changes — the same vertices and the same triangles are
 * rewritten in place every frame — so posing costs a couple of hundred writes
 * and allocates nothing.
 */
export function createVerityMouth(material) {
  const perLip = ALONG * ACROSS;
  const positions = new Float32Array(perLip * 2 * 3);

  const indices = [];
  for (let lip = 0; lip < 2; lip += 1) {
    const base = lip * perLip;
    for (let i = 0; i < ALONG - 1; i += 1) {
      for (let j = 0; j < ACROSS - 1; j += 1) {
        const a = base + i * ACROSS + j;
        const b = a + ACROSS;
        // Wound the other way on the lower lip, whose section is mirrored.
        if (lip === 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
        else indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "VerityMouth";
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  /** @param {Partial<MouthShape>} shape */
  function setShape(shape) {
    const { open, round, press, hiss, energy, smile } = { ...MOUTH_SHAPE_REST, ...shape };

    /*
     * Width.
     *
     * Rounding pulls the corners in, which is most of what "rounded" looks
     * like from the front. Spreading pushes them out, and it has to be gated
     * on energy rather than on aperture: "ee" is a wide mouth and a nearly
     * shut one at the same time, so a width that only grew with opening would
     * leave her saying "cheese" with her resting face on.
     */
    const spread = (1 - round) * energy;
    const halfWidth = HALF_WIDTH * (1 + spread * 0.2 + hiss * 0.12 - round * 0.38);

    /*
     * You cannot hold a wide grin with your jaw down, and pressed lips flatten
     * whatever expression was on them. Pursing and hissing flatten it too — a
     * smiling "oo" is not a shape a face makes. All of them take the smile
     * back rather than fighting it, so the expression survives underneath and
     * returns the moment she stops talking.
     */
    const grin =
      smile * (1 - open * 0.45) * (1 - press * 0.35) * (1 - round * 0.45) * (1 - hiss * 0.55);

    /*
     * Aperture takes whichever of the three asks for the most.
     *
     * A rounded mouth is small but definitely a hole; if the gap only came
     * from `open`, "oo" would be a narrow smile rather than a pursed O, since
     * the whole point of "oo" is that the jaw is barely down. Hissing keeps a
     * sliver open for the same reason — a sibilant is a slit, not a seal.
     */
    const aperture =
      MAX_APERTURE * Math.max(open, round * 0.5, hiss * 0.16) * (1 - press);

    // Squeezed lips read thicker; so does a pursed mouth, seen end-on.
    const stroke = STROKE * (1 + press * 0.34 + round * 0.12);
    /** How far open she is, as a fraction of the widest she goes. */
    const openness = aperture / MAX_APERTURE;

    for (let lip = 0; lip < 2; lip += 1) {
      const upper = lip === 0;
      const base = lip * perLip;

      for (let i = 0; i < ALONG; i += 1) {
        const u = (i / (ALONG - 1)) * 2 - 1;
        const x = halfWidth * u;
        const mid = CORNER_Y - DIP * grin * (1 - u * u);
        const y = lipHeight(u, mid, aperture, upper);

        /*
         * Thinner toward the corners, the way a lip is. It also keeps the two
         * strokes from piling up where they meet, which at rest is the only
         * place they touch.
         */
        const taper = 0.5 + 0.5 * Math.pow(Math.max(0, 1 - u * u), 0.4);
        // The lower lip is the fuller of the two, which is true of most faces.
        const thickness = stroke * taper * (upper ? 1 : 1.3);

        for (let j = 0; j < ACROSS; j += 1) {
          /*
           * 0 at the lip line, 1 at the outer edge — outward only.
           *
           * Each lip is built away from the opening rather than straddling it,
           * so at rest the two strokes meet along one seam instead of lying on
           * top of each other, which would be a whole plane of coincident
           * triangles for the depth buffer to argue about.
           */
          const s = j / (ACROSS - 1);
          const offset = 3 * (base + i * ACROSS + j);
          positions[offset] = x;
          positions[offset + 1] = y + (upper ? thickness * s : -thickness * s);
          /*
           * Where the round of the stroke crests, across its width.
           *
           * Closed, both crest at the seam, and the two halves reassemble into
           * exactly the round tube this replaced. As she opens, the lower lip's
           * crest travels outward. That is not decoration: with both cresting
           * at the seam, the upper lip's outer face tilts up into the key light
           * and the lower lip's tilts away from it, and no amount of extra
           * thickness fixed the upper lip reading as the pronounced one. Moving
           * the crest turns the lower lip's surface back toward the light.
           */
          const crest = upper ? 0 : 0.55 * openness;
          const across = (s - crest) / Math.max(crest, 1 - crest);
          positions[offset + 2] = DEPTH * Math.sqrt(Math.max(0, 1 - across * across));
        }
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  setShape(MOUTH_SHAPE_REST);

  return {
    object3d: mesh,
    setShape,
    /*
     * How the vertices are laid out: two lips of `along` columns, each column
     * `across` samples running from the lip line outward. Published because
     * anything measuring this mesh has to know it, and a test that keeps its
     * own copy of the numbers drifts the moment the sampling changes.
     */
    layout: { along: ALONG, across: ACROSS },
  };
}
