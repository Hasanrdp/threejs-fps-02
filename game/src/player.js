// The player: first-person body, look, health and the numbers weapons read. Movement
// runs through mover.stepBody so the player and the bots share one collision model.
// The camera is synced from here every frame by main.js.
import * as THREE from 'three';
import { makeBody, stepBody, groundSpeed } from './mover.js';

const STAND_H = 1.72;
const CROUCH_H = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK = 5.4;
const CROUCH_SPEED = 2.5;
const ACCEL = 46;
const AIR_ACCEL = 10;
const FRICTION = 10;
const GRAVITY = 20;
const JUMP = 6.4;

export function createPlayer(colliders) {
  const body = makeBody(0, 13.5, STAND_H);
  const probe = new THREE.Box3();
  const state = {
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    hp: 100,
    maxHp: 100,
    alive: true,
    crouching: false,
    armor: 0,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (wantCrouch && !state.crouching) {
      state.crouching = true;
      body.height = CROUCH_H;
    } else if (!wantCrouch && state.crouching) {
      // Stand only when the taller box fits.
      const probeBox = new THREE.Box3(
        new THREE.Vector3(body.position.x - 0.34, body.position.y + 0.02, body.position.z - 0.34),
        new THREE.Vector3(body.position.x + 0.34, body.position.y + STAND_H - 0.02, body.position.z + 0.34),
      );
      let blocked = false;
      for (const c of colliders) if (probeBox.intersectsBox(c)) { blocked = true; break; }
      if (!blocked) {
        state.crouching = false;
        body.height = STAND_H;
      }
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const str = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wx = 0;
    let wz = 0;
    if (fwd || str) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wx = -sin * fwd + cos * str;
      wz = -cos * fwd - sin * str;
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
    }
    const speed = state.crouching ? CROUCH_SPEED : WALK;
    const accel = body.onGround ? ACCEL : AIR_ACCEL;
    stepBody(body, colliders, dt, wx, wz, speed, accel, FRICTION, GRAVITY, JUMP, keys.has('Space'), probe);
  }

  function damage(amount, fromYaw) {
    if (!state.alive) return false;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.hp = Math.max(0, state.hp - rest);
    if (state.hp <= 0) state.alive = false;
    return !state.alive;
  }

  function reset(x, z) {
    body.position.set(x, 0, z);
    body.velocity.set(0, 0, 0);
    body.height = STAND_H;
    state.yaw = 0;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.hp = state.maxHp;
    state.alive = true;
    state.crouching = false;
    state.armor = 0;
  }

  return {
    body,
    state,
    step,
    look,
    recoil,
    damage,
    reset,
    speed() {
      return groundSpeed(body);
    },
    eyePos(out) {
      out.set(body.position.x, body.position.y + state.eye, body.position.z);
      return out;
    },
  };
}
