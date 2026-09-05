# Verity

The character. She owns her own geometry, materials, receipt printer and
animation, and knows nothing about a renderer, a scene, a microphone or an AI
provider — the host supplies those and drives her through the API below.

She began as a copy of the `accountantRobot` prototype and is now this project's
own. Change her here.

## Minimal integration

```js
import * as THREE from 'three';
import {
  VerityRobot,
  attachVerityPointerControls,
  createVerityShadowFloor,
  createVerityStudioLights
} from '$lib/character/index.js';

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.shadowMap.enabled = true;          // she casts a real shadow

const scene = new THREE.Scene();
scene.add(createVerityStudioLights());
scene.add(createVerityShadowFloor());        // invisible; catches the shadow

const verity = new VerityRobot({ renderer });
scene.add(verity.object3d);
const releasePointer = attachVerityPointerControls(canvas, verity);

// Once per frame:
verity.update(now / 1000, delta);
```

Pass the renderer so the receipt texture can use the device's maximum
anisotropy. Frame the camera yourself — `frameVerityCamera` is a starting point,
but fitting to her measured bounds handles arbitrary stage shapes far better.

## State

| Method | Effect |
| --- | --- |
| `setMode(mode)` | `idle`, `listening`, `thinking`, `speaking` — her behavioural state |
| `setAudioLevel(level)` | 0–1, every audio frame. Drives the mouth and paper flutter |
| `setOutputAudioActive(active)` | True while sound is genuinely audible. This is what feeds the receipt |
| `beginResponse()` | Start a new response on the paper without clearing what is there |
| `appendTranscript(delta)` | Queue text for paced printing |
| `clearTranscript()` | Clear all receipt state |
| `update(time, delta)` | Advance everything. Once per rendered frame |
| `getState()` | A small serialisable snapshot |
| `dispose()` | Release geometry, materials and textures |

## Expression and attention

| Method | Effect |
| --- | --- |
| `lookAt(pitch, yaw, weight)` | Look at something. Blends *over* the ambient pointer-following rather than replacing it, so handing attention back is a fade |
| `releaseGaze()` | Hand her back to the pointer |
| `react(kind, strength)` | `delight`, `concern`, `nod`. Decays on its own — fire and forget |
| `pressKey(index)` | Press a key: `+`, `−`, `×`, `=` in order. It travels and springs back |
| `keyPressAmount(index)` | How far a key is depressed, 0–1, for a caller driving sound |
| `setDragRotation(pitch, yaw)` | The damped inspection angle, for drag controls |
| `resetRotation()` | Back to the front view |

Her eyes have pupils, and the pupils lead the head: she looks with her eyes
slightly before her head arrives, which is what makes a gaze read as intent
rather than as a head on a spring. Two plain ovals cannot look at anything.

## The audio adapter contract

She is provider-agnostic. WebRTC, an `<audio>` element, prerecorded audio or a
synthesised envelope all drive the same API. For a spoken response:

1. `beginResponse()` once.
2. `appendTranscript(delta)` as transcript arrives.
3. Analyse the real output waveform and call `setAudioLevel()` every frame.
4. Keep `setOutputAudioActive(true)` while sound is *audible*, not merely while
   a response object exists — this is what keeps the receipt moving for the
   whole utterance.
5. Level to `0` and active to `false` once the tail ends.

Text has no waveform. `printerEnvelope()` in `$lib/components` synthesises one
so a typed answer prints onto the paper exactly as a spoken one does.

## Files

```text
src/lib/character/
├── VerityRobot.js    Geometry, materials, receipt, animation, expression
├── dragControls.js   Optional pointer adapter
├── studioLights.js   Light rig, shadow floor, camera framing
├── index.js          Public exports
└── index.d.ts        Types — the JS has no annotations of its own
```
