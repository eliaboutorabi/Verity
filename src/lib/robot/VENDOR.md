# Verity robot — a fork

This folder began as a verbatim copy of `accountantRobot/src/robot`, the
portable Three.js character built for the original Verity prototype. It owns
geometry, materials, the receipt printer, and all character animation, and it
deliberately knows nothing about a renderer, a scene, a microphone, or an AI
provider.

**It is now a fork.** `update()` owns the eyes, mouth and keypad on every frame,
so interaction that touches any of them cannot be layered on from outside — it
has to live in the character. Three things were added:

| Added | Why |
| --- | --- |
| `pressKey(index)` / `keyPressAmount(index)` | A key that can be pressed and springs back. `update()` sets `key.position.z` every frame, so the travel has to be computed there. |
| `react(kind, strength)` | A momentary expression — delight, concern, a nod — decaying on its own, layered over whatever `mode` she is in. Delight deepens the smile arc and squints the eyes, which is what reads as a smile on a face with no cheeks. |
| `lookAt(pitch, yaw, weight)` / `releaseGaze()` | Deliberate gaze that blends *over* the ambient pointer-following rather than replacing it, so handing attention back is a fade and not a snap. |

Nothing else was changed. To take an upstream fix, diff rather than re-copy.

Do not add app concerns here. The host supplies the renderer, camera, lights and
animation loop, and drives the character through the documented API:

```js
robot.setMode('listening' | 'thinking' | 'speaking' | 'idle')
robot.setAudioLevel(level)        // 0–1, every audio-analysis frame
robot.setOutputAudioActive(bool)  // true while sound is genuinely audible
robot.beginResponse()
robot.appendTranscript(delta)
robot.update(timeSeconds, deltaSeconds)

robot.pressKey(3)                 // the = key travels and springs back
robot.react('delight')            // squint and a wider smile, for a beat
robot.lookAt(pitch, yaw, 0.8)     // aim her at something that just happened
robot.releaseGaze()               // hand her back to the pointer
```

See `README.md` in this folder for the full contract. To pull upstream changes,
re-copy the folder rather than editing files here.
