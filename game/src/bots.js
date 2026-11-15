// The bots: two Vanguard teammates and three Sentinel defenders. Each bot is a body
// that moves through the shared mover, a visible figure the player can shoot (head
// and body are separate hit parts), and a small state machine: follow a route to a
// post, hold and scan, engage what it sees, investigate a noise, and converge on a
// planted bomb. Bots hear gunfire, react with a delay, and fire in bursts whose hit
// chance falls with distance and target movement.
import * as THREE from 'three';
import { makeBody, stepBody } from './mover.js';
import { PALETTE } from './palette.js';

const BOT_H = 1.72;
const BOT_SPEED = 4.3;
const BOT_ACCEL = 40;
const BOT_FRICTION = 9;
const BOT_GRAVITY = 20;
const BOT_JUMP = 0;
const SIGHT_RANGE = 48;
const HEAR_RANGE = 26;

const NAMES_ATTACK = ['Rook', 'Hale'];
const NAMES_DEFEND = ['Vex', 'Mara', 'Odin'];

function botMaterial(team) {
  const color = team === 'attack' ? PALETTE.brass : PALETTE.steel;
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.75, metalness: 0.15 });
}
function botDarkMaterial(team) {
  const color = team === 'attack' ? '#6b4d1c' : '#2c4a63';
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.8, metalness: 0.1 });
}

export function createBots(scene, map, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const bots = [];
  const hitMeshes = [];

  function makeBot(id, team, name, spawn, weapon, route, post) {
    const body = makeBody(spawn.x, spawn.z, BOT_H);
    const probe = new THREE.Box3();
    const figure = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.95, 0.3), botMaterial(team));
    torso.position.y = 0.95;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), botDarkMaterial(team));
    head.position.y = 1.62;
    head.castShadow = true;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attack' ? PALETTE.accent : '#bfe3ff'), emissive: new THREE.Color(team === 'attack' ? PALETTE.accent : '#bfe3ff'), emissiveIntensity: 1.4 }),
    );
    visor.position.set(0, 1.64, 0.18);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), botDarkMaterial(team));
    gun.position.set(0.2, 1.25, -0.3);
    figure.add(torso, head, visor, gun);
    group.add(figure);
    const bot = {
      id, team, name,
      body, probe, figure, torso, head,
      weapon,
      yaw: team === 'attack' ? Math.PI : 0,
      pitch: 0,
      hp: 100,
      alive: true,
      route: route.slice(),
      routeIndex: 0,
      post: post.clone(),
      state: 'route',
      target: null,
      lastSeen: -10,
      reactAt: 0,
      burstLeft: 0,
      burstGap: 0,
      pauseUntil: 0,
      mag: weapon.mag,
      reloadUntil: 0,
      investigatePos: null,
      scanDir: rng.range(0, Math.PI * 2),
      strafeDir: 1,
      strafeUntil: 0,
      fall: 0,
    };
    torso.userData = { bot, part: 'body' };
    head.userData = { bot, part: 'head' };
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  const rifle = { id: 'rifle', name: 'AR-77', damage: 30, mag: 30, gap: 0.11, reload: 1.9 };
  const smg = { id: 'smg', name: 'VK-9', damage: 20, mag: 30, gap: 0.09, reload: 1.6 };

  makeBot(0, 'attack', NAMES_ATTACK[0], map.spawns.attack[1], rifle, map.routes.toA, map.routes.holdA[0]);
  makeBot(1, 'attack', NAMES_ATTACK[1], map.spawns.attack[2], smg, map.routes.toB, map.routes.holdB[0]);
  makeBot(2, 'defend', NAMES_DEFEND[0], map.spawns.defend[1], rifle, map.routes.toA, map.routes.holdA[1]);
  makeBot(3, 'defend', NAMES_DEFEND[1], map.spawns.defend[2], smg, map.routes.toB, map.routes.holdB[1]);
  makeBot(4, 'defend', NAMES_DEFEND[2], map.spawns.defend[0], rifle, map.routes.toMid, map.routes.holdMid[0]);

  function eyePos(bot, out) {
    out.set(bot.body.position.x, bot.body.position.y + 1.58, bot.body.position.z);
    return out;
  }

  function reset(round) {
    for (const bot of bots) {
      const spawn = bot.team === 'attack' ? map.spawns.attack[bot.id % 3] : map.spawns.defend[bot.id % 3];
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'attack' ? Math.PI : 0;
      bot.pitch = 0;
      bot.hp = 100;
      bot.alive = true;
      bot.routeIndex = 0;
      bot.state = 'route';
      bot.target = null;
      bot.lastSeen = -10;
      bot.burstLeft = 0;
      bot.mag = bot.weapon.mag;
      bot.reloadUntil = 0;
      bot.investigatePos = null;
      bot.fall = 0;
      bot.figure.rotation.set(0, bot.yaw, 0);
      bot.figure.position.copy(bot.body.position);
      bot.figure.visible = true;
      bot.torso.visible = true;
      bot.head.visible = true;
    }
    void round;
  }

  function step(dt, time, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        // Fall over once, then lie still.
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt * 3);
          bot.figure.rotation.x = -Math.PI / 2 * bot.fall * 0.9;
          bot.figure.position.y = bot.body.position.y + 0.2 * bot.fall;
        }
        continue;
      }
      // --- Perception: nearest visible enemy. ---
      let seen = null;
      let seenDist = Infinity;
      const eye = eyePos(bot, new THREE.Vector3());
      for (const other of ctx.enemiesOf(bot)) {
        if (!other.alive) continue;
        const to = new THREE.Vector3(other.pos.x, other.pos.y + 1.2, other.pos.z);
        const dist = eye.distanceTo(to);
        if (dist > SIGHT_RANGE) continue;
        const dx = to.x - eye.x;
        const dz = to.z - eye.z;
        const ang = Math.atan2(-dx, -dz);
        let diff = ang - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > 1.15 && dist > 6) continue;
        if (!ctx.clearShot(eye, to)) continue;
        if (dist < seenDist) {
          seen = other;
          seenDist = dist;
        }
      }
      if (seen) {
        if (bot.target !== seen) {
          bot.target = seen;
          bot.reactAt = time + 0.35 + rng.next() * 0.35;
          bot.burstLeft = 0;
        }
        bot.lastSeen = time;
        bot.state = 'engage';
      } else if (bot.target && time - bot.lastSeen < 1.2) {
        bot.state = 'engage';
      } else {
        bot.target = null;
        if (bot.investigatePos && time < bot.investigatePos.until) {
          bot.state = 'investigate';
        } else if (bot.routeIndex < bot.route.length) {
          bot.state = 'route';
        } else {
          bot.state = 'hold';
        }
      }

      // --- Movement target and facing. ---
      let wishX = 0;
      let wishZ = 0;
      let wantYaw = bot.yaw;
      if (bot.state === 'engage' && bot.target) {
        const tp = bot.target.pos;
        const dx = tp.x - bot.body.position.x;
        const dz = tp.z - bot.body.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        wantYaw = Math.atan2(-dx, -dz);
        // Strafe to stay unpredictable, keep distance.
        if (time > bot.strafeUntil) {
          bot.strafeDir = rng.chance(0.5) ? 1 : -1;
          bot.strafeUntil = time + rng.range(0.7, 1.6);
        }
        if (dist > 14) {
          wishX = dx / dist;
          wishZ = dz / dist;
        } else if (dist < 6) {
          wishX = -dx / dist;
          wishZ = -dz / dist;
        } else {
          const px = -dz / dist;
          const pz = dx / dist;
          wishX = px * bot.strafeDir * 0.7;
          wishZ = pz * bot.strafeDir * 0.7;
        }
      } else if (bot.state === 'route') {
        const wp = bot.route[bot.routeIndex];
        const dx = wp.x - bot.body.position.x;
        const dz = wp.z - bot.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) {
          bot.routeIndex += 1;
        } else {
          wishX = dx / dist;
          wishZ = dz / dist;
          wantYaw = Math.atan2(-dx, -dz);
        }
      } else if (bot.state === 'investigate' && bot.investigatePos) {
        const p = bot.investigatePos;
        const dx = p.x - bot.body.position.x;
        const dz = p.z - bot.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.2) {
          bot.investigatePos = null;
        } else {
          wishX = dx / dist;
          wishZ = dz / dist;
          wantYaw = Math.atan2(-dx, -dz);
        }
      } else {
        // Hold: slow scan.
        bot.scanDir += dt * 0.5;
        wantYaw = bot.scanDir;
      }
      // Turn toward the wanted yaw.
      let dyaw = wantYaw - bot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));

      const speed = bot.state === 'engage' ? BOT_SPEED * 0.55 : BOT_SPEED;
      stepBody(bot.body, map.colliders, dt, wishX, wishZ, speed, BOT_ACCEL, BOT_FRICTION, BOT_GRAVITY, BOT_JUMP, false, bot.probe);

      // --- Shooting. ---
      if (bot.state === 'engage' && bot.target && time >= bot.reactAt) {
        if (bot.reloadUntil > time) {
          // reloading
        } else if (bot.mag <= 0) {
          bot.reloadUntil = time + bot.weapon.reload;
          bot.mag = bot.weapon.mag;
          bot.burstLeft = 0;
        } else if (bot.burstLeft > 0) {
          bot.burstGap -= dt;
          if (bot.burstGap <= 0) {
            bot.burstGap = bot.weapon.gap;
            bot.burstLeft -= 1;
            bot.mag -= 1;
            fireAt(bot, time, ctx);
            if (bot.burstLeft === 0) bot.pauseUntil = time + rng.range(0.5, 0.95);
          }
        } else if (time >= bot.pauseUntil) {
          bot.burstLeft = 3 + Math.floor(rng.next() * 3);
          bot.burstGap = 0;
        }
      }

      // --- Sync the figure. ---
      bot.figure.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
      bot.figure.rotation.y = bot.yaw;
      bot.figure.rotation.x = 0;
    }
  }

  function fireAt(bot, time, ctx) {
    const target = bot.target;
    if (!target || !target.alive) return;
    const eye = eyePos(bot, new THREE.Vector3());
    const muzzle = eye.clone();
    muzzle.x += -Math.sin(bot.yaw) * 0.4;
    muzzle.z += -Math.cos(bot.yaw) * 0.4;
    muzzle.y -= 0.1;
    const tp = new THREE.Vector3(target.pos.x, target.pos.y + 1.25, target.pos.z);
    const dist = eye.distanceTo(tp);
    // Hit chance: close and still is deadly, far and moving is not.
    let p = 0.55 - dist * 0.008;
    if (target.moving) p *= 0.7;
    if (target.crouching) p *= 0.8;
    const moving = Math.hypot(bot.body.velocity.x, bot.body.velocity.z) > 1;
    if (moving) p *= 0.75;
    p = Math.max(0.1, Math.min(0.55, p));
    const hit = rng.next() < p;
    const head = hit && rng.next() < 0.08;
    const end = tp.clone();
    if (!hit) {
      end.x += rng.range(-1.6, 1.6);
      end.y += rng.range(-0.6, 1.2);
      end.z += rng.range(-1.6, 1.6);
    }
    ctx.tracer(muzzle, end, bot.team === 'attack' ? PALETTE.brass : PALETTE.steel);
    ctx.noise(muzzle, HEAR_RANGE);
    if (hit) {
      const falloff = dist < 15 ? 1 : Math.max(0.65, 1 - (dist - 15) * 0.01);
      const dmg = bot.weapon.damage * falloff * (head ? 3 : 1);
      ctx.damageTarget(target, dmg, head, bot);
    }
    void time;
  }

  function hearNoise(pos, radius) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.body.position.x - pos.x, bot.body.position.z - pos.z);
      if (d < radius && bot.state !== 'engage') {
        bot.investigatePos = { x: pos.x, z: pos.z, until: 6 };
      }
    }
  }

  // After a plant, the defenders converge on the bomb itself (not just the site
  // centre) so one of them can reach it and defuse.
  function convergeOn(pos) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.team === 'defend') {
        bot.route = [pos.clone()];
        bot.routeIndex = 0;
        bot.state = 'route';
      }
    }
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.team === team && bot.alive) n += 1;
    return n;
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    hearNoise,
    convergeOn,
    aliveCount,
    damage(bot, amount, part) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp <= 0) {
        bot.hp = 0;
        bot.alive = false;
        bot.state = 'dead';
      }
      return !bot.alive;
    },
  };
}
