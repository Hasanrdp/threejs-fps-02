// Emberworks: boot and the one loop. A fixed 60 Hz simulation feeds a render at the
// display's rate. ?shot=start|play|buy|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE } from './arsenal.js';
import { createBots } from './bots.js';
import { createRounds, BUY_TIME, ROUND_TIME, OVER_TIME } from './rounds.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const player = createPlayer(map.colliders);
const arsenal = createArsenal(camera, rng);
const bots = createBots(scene, map, rng);
const rounds = createRounds();
const bomb = createBomb(scene, map);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const losRay = new THREE.Raycaster();
losRay.far = 60;
const shootables = map.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const grenades = [];

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let defuseBot = null;
let defuseProgress = 0;
let roundEnded = false;

function eyePos(out) {
  return player.eyePos(out);
}

function syncCamera() {
  camera.position.set(player.body.position.x, player.body.position.y + player.state.eye, player.body.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const eye = eyePos(tmpVec);
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// Line of sight for bots: true when no world surface blocks the segment.
function clearShot(from, to) {
  const dist = from.distanceTo(to);
  if (dist < 0.01) return true;
  losRay.set(from, tmpVec2.copy(to).sub(from).normalize());
  losRay.far = dist;
  const hit = losRay.intersectObjects(map.shootables, false)[0];
  return !hit;
}

function enemiesOf(bot) {
  const list = [];
  const p = player;
  if (bot.team === 'defend' && p.state.alive) {
    list.push({
      kind: 'player', pos: p.body.position, alive: true,
      moving: p.speed() > 1, crouching: p.state.crouching,
    });
  }
  for (const other of bots.bots) {
    if (other === bot || other.team === bot.team || !other.alive) continue;
    list.push({
      kind: 'bot', bot: other, pos: other.body.position, alive: true,
      moving: Math.hypot(other.body.velocity.x, other.body.velocity.z) > 1, crouching: false,
    });
  }
  if (bot.team === 'attack' && p.state.alive) {
    // Teammate bots never target the player; the list is only enemies.
  }
  return list;
}

function damageTarget(target, amount, head, attacker) {
  if (target.kind === 'player') {
    const died = player.damage(amount, 0);
    hud.damageFlash();
    hud.setHealth(player.state.hp, player.state.maxHp, player.state.armor);
    audio.hurt();
    if (died) {
      rounds.addDeath();
      const name = attacker ? attacker.name : 'Sentinel';
      hud.killfeed(name, 'You', head, attacker ? attacker.weapon.name : 'AR-77');
      checkRoundEnd();
    }
    return died;
  }
  const bot = target.bot;
  const died = bots.damage(bot, amount, head ? 'head' : 'body');
  if (died) {
    const name = attacker && attacker.kind === 'player' ? 'You' : (attacker ? attacker.name : 'Vanguard');
    hud.killfeed(name, bot.name, head, attacker && attacker.kind === 'player' ? arsenal.def().name : (attacker ? attacker.weapon.name : 'AR-77'));
    if (attacker && attacker.kind === 'player') {
      rounds.addKillMoney();
      hud.setMoney(rounds.state.money);
      audio.kill();
    }
    checkRoundEnd();
  }
  return died;
}

function shootPlayer(spread) {
  if (!arsenal.takeRound()) {
    audio.denied();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (rng.next() * 2 - 1) * spread;
  direction.y += (rng.next() * 2 - 1) * spread;
  direction.z += (rng.next() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const muzzle = eyePos(tmpVec2).clone();
  muzzle.x += -Math.sin(player.state.yaw) * 0.3;
  muzzle.z += -Math.cos(player.state.yaw) * 0.3;
  muzzle.y -= 0.12;
  let end;
  if (hit) {
    end = hit.point.clone();
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const def = arsenal.def();
      const dist = camera.position.distanceTo(hit.point);
      const falloff = dist < 15 ? 1 : Math.max(0.6, 1 - (dist - 15) * 0.012);
      const dmg = def.damage * falloff * (part === 'head' ? def.headMult : 1);
      const died = bots.damage(bot, dmg, part);
      hud.hitMarker(died);
      audio.hit();
      effects.sparksAt(hit.point, 4, rng);
      if (died) {
        hud.killfeed('You', bot.name, part === 'head', def.name);
        rounds.addKillMoney();
        hud.setMoney(rounds.state.money);
        audio.kill();
        checkRoundEnd();
      }
    } else {
      effects.sparksAt(hit.point, 5, rng);
    }
  } else {
    end = camera.position.clone().add(direction.clone().multiplyScalar(60));
  }
  effects.tracer(muzzle, end, PALETTE.accent);
  bots.hearNoise(muzzle, 26);
  audio.shot();
  arsenal.pullTrigger();
  player.recoil(arsenal.def().kick, (rng.next() * 2 - 1) * arsenal.def().yawKick);
  const ammo = arsenal.ammo();
  hud.setAmmo(ammo.mag, ammo.reserve, arsenal.def().name);
  return true;
}

function throwGrenade() {
  if (!arsenal.throwGrenade()) return;
  camera.getWorldDirection(direction);
  const eye = eyePos(tmpVec);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.4 }),
  );
  mesh.position.copy(eye);
  scene.add(mesh);
  const g = {
    mesh,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)).add(player.body.velocity.clone().multiplyScalar(0.4)),
    fuse: 1.2,
    pos: eye.clone(),
  };
  grenades.push(g);
  audio.shot();
  hud.setGrenades(arsenal.state.grenades);
}

function explodeGrenade(g) {
  const p = g.pos;
  effects.explosion(p);
  audio.explosion();
  bots.hearNoise(p, 30);
  const victims = [];
  if (player.state.alive) victims.push({ kind: 'player', pos: player.body.position });
  for (const b of bots.bots) if (b.alive) victims.push({ kind: 'bot', bot: b, pos: b.body.position });
  for (const v of victims) {
    const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) + Math.abs((v.pos.y + 1) - p.y) * 0.5;
    if (d < 7) {
      const dmg = Math.max(12, 95 * (1 - d / 7));
      if (v.kind === 'player') {
        const died = player.damage(dmg, 0);
        hud.damageFlash();
        hud.setHealth(player.state.hp, player.state.maxHp, player.state.armor);
        if (died) {
          rounds.addDeath();
          hud.killfeed('Frag', 'You', false, 'Grenade');
          checkRoundEnd();
        }
      } else {
        const died = bots.damage(v.bot, dmg, 'body');
        if (died) {
          hud.killfeed('You', v.bot.name, false, 'Grenade');
          rounds.addKillMoney();
          hud.setMoney(rounds.state.money);
          checkRoundEnd();
        }
      }
    }
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 16 * dt;
    const next = g.pos.clone().add(g.vel.clone().multiplyScalar(dt));
    // Bounce off the world: a cheap AABB test against the map colliders.
    const probe = new THREE.Box3(
      new THREE.Vector3(next.x - 0.09, next.y - 0.09, next.z - 0.09),
      new THREE.Vector3(next.x + 0.09, next.y + 0.09, next.z + 0.09),
    );
    let hitWall = false;
    for (const c of map.colliders) {
      if (probe.intersectsBox(c)) { hitWall = true; break; }
    }
    if (hitWall) {
      g.vel.multiplyScalar(-0.45);
      g.vel.y = Math.abs(g.vel.y) * 0.45 + 1.5;
      next.copy(g.pos);
    }
    if (next.y < 0.09) {
      next.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.8;
      g.vel.z *= 0.8;
    }
    g.pos.copy(next);
    g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) {
      explodeGrenade(g);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live' || roundEnded) return;
  const attackAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('attack');
  const defendAlive = bots.aliveCount('defend');
  if (defendAlive === 0) {
    roundEnded = true;
    rounds.endRound('attack', 'Sentinel eliminated');
    onRoundOver('Vanguard wins the round', 'Every Sentinel is down. The yard is yours.');
  } else if (attackAlive === 0) {
    roundEnded = true;
    rounds.endRound('defend', 'Vanguard eliminated');
    onRoundOver('Sentinel wins the round', 'Every Vanguard is down. The yard holds.');
  }
}

function onRoundOver(title, copy) {
  hud.showOverlay('round', { title, copy });
  if (document.pointerLockElement) document.exitPointerLock();
  if (rounds.state.scoreAttack > rounds.state.scoreDefend) audio.roundWin();
  else audio.roundLose();
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setMoney(rounds.state.money);
  hud.clearBomb();
  hud.clearPlant();
}

function resetRound() {
  roundEnded = false;
  defuseBot = null;
  defuseProgress = 0;
  bomb.reset();
  const atk = map.spawns.attack;
  player.reset(atk[0].x, atk[0].z);
  player.state.yaw = 0;
  bots.reset(rounds.state.round);
  arsenal.refill();
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  hud.clearBomb();
  hud.clearPlant();
  hud.hideBuyMenu();
  buyOpen = false;
  const ammo = arsenal.ammo();
  hud.setAmmo(ammo.mag, ammo.reserve, arsenal.def().name);
  hud.setHealth(player.state.hp, player.state.maxHp, player.state.armor);
  hud.setMoney(rounds.state.money);
  hud.setGrenades(arsenal.state.grenades);
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  rounds.startRound();
  hud.setTimer(BUY_TIME, 'Buy');
  syncCamera();
}

function buyItems() {
  const money = rounds.state.money;
  const items = [];
  for (const def of WEAPONS) {
    if (def.id === 'pistol' || def.id === 'rifle') continue;
    const owned = arsenal.owned.get(def.id).have;
    items.push({
      key: def.id === 'smg' ? '1' : '2',
      name: def.name,
      desc: `${def.damage} dmg · ${def.mag} rounds · ${def.auto ? 'automatic' : 'semi-auto'}`,
      price: def.price,
      owned,
      id: def.id,
    });
  }
  items.push({ key: '3', name: 'Frag Grenade', desc: `Blast radius 7 m · carry up to 2`, price: GRENADE_PRICE, owned: false, id: 'grenade' });
  items.push({ key: '4', name: 'Kevlar Vest', desc: 'Absorbs half of incoming damage', price: 650, owned: player.state.armor > 0, id: 'armor' });
  return items;
}

function tryBuy(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'grenade') {
    const r = arsenal.buyGrenade(rounds.state.money);
    if (r.ok && rounds.spend(r.cost)) {
      audio.buy();
      hud.setGrenades(arsenal.state.grenades);
      hud.setMoney(rounds.state.money);
      hud.showBuyMenu(buyItems(), rounds.state.money);
    } else {
      audio.denied();
      hud.message(r.reason || 'Cannot buy');
    }
    return;
  }
  if (id === 'armor') {
    const r = arsenal.buyArmor(rounds.state.money);
    if (r.ok && rounds.spend(r.cost)) {
      player.state.armor = 100;
      audio.buy();
      hud.setHealth(player.state.hp, player.state.maxHp, player.state.armor);
      hud.setMoney(rounds.state.money);
      hud.showBuyMenu(buyItems(), rounds.state.money);
    } else {
      audio.denied();
      hud.message(r.reason || 'Cannot buy');
    }
    return;
  }
  const r = arsenal.buy(id, rounds.state.money);
  if (r.ok && rounds.spend(r.cost)) {
    audio.buy();
    arsenal.switchTo(id);
    const ammo = arsenal.ammo();
    hud.setAmmo(ammo.mag, ammo.reserve, arsenal.def().name);
    hud.setMoney(rounds.state.money);
    hud.showBuyMenu(buyItems(), rounds.state.money);
  } else {
    audio.denied();
    hud.message(r.reason || 'Cannot buy');
  }
}

function step(dt) {
  elapsed += dt;
  const rs = rounds.state;

  // Round clock.
  if (rs.phase === 'buy' || rs.phase === 'live') {
    const left = rounds.tick(dt);
    if (rs.phase === 'buy') {
      hud.setTimer(left, 'Buy');
      if (left <= 0) {
        rs.phase = 'live';
        rs.timer = ROUND_TIME;
        hud.hideBuyMenu();
        buyOpen = false;
        hud.message('Round live — plant the bomb at Furnace or Yard');
        audio.beep();
      }
    } else {
      hud.setTimer(left, bomb.state.status === 'planted' ? 'Bomb' : 'Round');
      if (bomb.state.status !== 'planted' && left <= 0) {
        roundEnded = true;
        rounds.endRound('defend', 'Time expired');
        onRoundOver('Sentinel wins the round', 'Time ran out before the bomb went down.');
      }
    }
  } else if (rs.phase === 'over') {
    const left = rounds.tick(dt);
    hud.setTimer(left, 'Next');
    if (left <= 0) {
      if (rs.matchOver) {
        hud.showOverlay('match', {
          title: rs.matchWinner === 'attack' ? 'Vanguard takes the match' : 'Sentinel takes the match',
          copy: `Final score — Vanguard ${rs.scoreAttack} : ${rs.scoreDefend} Sentinel.`,
        });
        if (document.pointerLockElement) document.exitPointerLock();
        frozen = true;
      } else {
        rounds.nextRound();
        resetRound();
        hud.message(`Round ${rs.round} — buy phase`);
      }
    }
  }

  // Bomb fuse and defuse.
  bomb.step(dt, elapsed);
  if (bomb.state.status === 'planted') {
    hud.setBombPlanted(bomb.state.site === 'A' ? 'Furnace' : 'Yard', bomb.state.fuse);
    if (bomb.state.status === 'exploded') {
      // handled below by status check
    }
    // A defender near the bomb defuses it.
    let near = null;
    for (const b of bots.bots) {
      if (b.team !== 'defend' || !b.alive) continue;
      const d = Math.hypot(b.body.position.x - bomb.state.position.x, b.body.position.z - bomb.state.position.z);
      if (d < 1.6) { near = b; break; }
    }
    if (near) {
      defuseBot = near;
      defuseProgress += dt;
      hud.setPlant(`Defusing — ${near.name}`, defuseProgress / DEFUSE_TIME);
      if (defuseProgress >= DEFUSE_TIME) {
        bomb.state.status = 'defused';
        roundEnded = true;
        rounds.endRound('defend', 'Bomb defused');
        onRoundOver('Sentinel wins the round', `${near.name} defused the bomb.`);
      }
    } else {
      defuseBot = null;
      defuseProgress = Math.max(0, defuseProgress - dt * 2);
      if (defuseProgress <= 0) hud.clearPlant();
    }
  }
  if (bomb.state.status === 'exploded' && rs.phase === 'live') {
    effects.explosion(bomb.state.position);
    audio.explosion();
    roundEnded = true;
    rounds.endRound('attack', 'Bomb detonated');
    onRoundOver('Vanguard wins the round', 'The bomb went off at the site.');
  }

  // Player movement and actions.
  if (player.state.alive && !frozen) {
    player.step(dt, input.state.keys);
    const speed = player.speed();
    if (input.state.firing && arsenal.ready() && rs.phase === 'live') {
      shootPlayer(arsenal.spread(speed, player.state.crouching));
    } else if (input.state.firing && arsenal.ready() && rs.phase === 'buy') {
      shootPlayer(arsenal.spread(speed, player.state.crouching));
    }
    if (input.takePressed('KeyR')) arsenal.reload();
    if (input.takePressed('KeyG')) throwGrenade();
    // Weapon slots and buy-menu keys share Digit1-4: when the buy menu is open
    // the keys buy, otherwise they switch weapons. One press is one action.
    if (buyOpen && rs.phase === 'buy') {
      if (input.takePressed('Digit1')) tryBuy('smg');
      if (input.takePressed('Digit2')) tryBuy('sniper');
      if (input.takePressed('Digit3')) tryBuy('grenade');
      if (input.takePressed('Digit4')) tryBuy('armor');
    } else {
      if (input.takePressed('Digit1')) arsenal.switchTo('pistol');
      if (input.takePressed('Digit2')) arsenal.switchTo('rifle');
      if (input.takePressed('Digit3')) arsenal.switchTo('smg');
      if (input.takePressed('Digit4')) arsenal.switchTo('sniper');
    }
    if (input.takePressed('KeyQ')) {
      const order = ['rifle', 'smg', 'sniper', 'pistol'];
      const cur = order.indexOf(arsenal.state.current);
      for (let i = 1; i <= order.length; i += 1) {
        if (arsenal.switchTo(order[(cur + i) % order.length])) break;
      }
    }
    if (input.takePressed('KeyB') && rs.phase === 'buy') {
      buyOpen = !buyOpen;
      if (buyOpen) hud.showBuyMenu(buyItems(), rs.money);
      else hud.hideBuyMenu();
    }
    // Planting: hold E inside a site while the bomb is carried.
    if (rs.phase === 'live' && bomb.state.status === 'carried' && input.state.keys.has('KeyE')) {
      const siteKey = bomb.siteAt(player.body.position);
      if (siteKey) {
        bomb.state.plantProgress += dt;
        hud.setPlant(`Planting at ${siteKey === 'A' ? 'Furnace' : 'Yard'}`, bomb.state.plantProgress / PLANT_TIME);
        if (bomb.state.plantProgress >= PLANT_TIME) {
          bomb.plantAt(siteKey, player.body.position.clone());
          rounds.addPlantMoney();
          hud.setMoney(rs.money);
          hud.message(`Bomb planted at ${siteKey === 'A' ? 'Furnace' : 'Yard'} — hold the site`);
          audio.plant();
          bots.convergeOn(bomb.state.position);
          hud.clearPlant();
        }
      } else {
        bomb.state.plantProgress = Math.max(0, bomb.state.plantProgress - dt * 2);
        if (bomb.state.plantProgress <= 0) hud.clearPlant();
      }
    } else if (bomb.state.status === 'carried') {
      bomb.state.plantProgress = Math.max(0, bomb.state.plantProgress - dt * 2);
      if (bomb.state.plantProgress <= 0 && defuseBot === null) hud.clearPlant();
    }
  }

  arsenal.step(dt);
  bots.step(dt, elapsed, {
    enemiesOf,
    clearShot,
    tracer: (from, to, color) => effects.tracer(from, to, color),
    noise: (pos, radius) => bots.hearNoise(pos, radius),
    damageTarget,
  });
  effects.step(dt);
  stepGrenades(dt);

  // HUD: ammo and crosshair spread.
  const ammo = arsenal.ammo();
  hud.setAmmo(ammo.mag, ammo.reserve, arsenal.def().name);
  const spreadPx = 4 + arsenal.spread(player.speed(), player.state.crouching) * 2600;
  hud.setCrosshair(spreadPx);
  hud.setGrenades(arsenal.state.grenades);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  started = true;
  rounds.startRound();
  if (name === 'start') {
    player.reset(0, 13.5);
    player.state.yaw = 0;
    player.state.pitch = 0.02;
    settle(30);
    hud.showOverlay('start', {});
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_TIME, 'Buy');
    hud.setMoney(rounds.state.money);
  } else if (name === 'play') {
    resetRound();
    rounds.startLive();
    // Put the player mid-map, aimed at a defender holding the furnace lane.
    player.body.position.set(2, 0, 4);
    player.state.yaw = 0.35;
    player.state.pitch = 0.01;
    const foe = bots.bots[2];
    foe.body.position.set(11.5, 0, -8.5);
    foe.yaw = Math.PI;
    foe.figure.position.copy(foe.body.position);
    foe.figure.rotation.y = foe.yaw;
    foe.state = 'hold';
    foe.routeIndex = foe.route.length;
    settle(10);
    aimAt(new THREE.Vector3(11.5, 1.35, -8.5));
    shootPlayer(0);
    settle(6);
    hud.setScore(0, 0, 1);
    hud.setTimer(82, 'Round');
  } else if (name === 'buy') {
    resetRound();
    player.body.position.set(0, 0, 13.5);
    player.state.yaw = 0;
    player.state.pitch = 0.02;
    rounds.state.money = 2450;
    settle(10);
    hud.showBuyMenu(buyItems(), rounds.state.money);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_TIME, 'Buy');
  } else {
    // end: the round is won, the bomb went off at Furnace, Sentinels are down.
    resetRound();
    rounds.state.scoreAttack = 1;
    rounds.state.scoreDefend = 0;
    rounds.state.round = 1;
    rounds.state.phase = 'over';
    rounds.state.timer = OVER_TIME;
    for (const b of bots.bots) {
      if (b.team === 'defend') {
        b.hp = 0;
        b.alive = false;
        b.state = 'dead';
        b.fall = 1;
        b.figure.rotation.x = -Math.PI / 2 * 0.9;
        b.figure.position.y = 0.2;
      }
    }
    player.body.position.set(6, 0, -2);
    player.state.yaw = -0.5;
    player.state.pitch = 0.02;
    settle(10);
    hud.showOverlay('round', { title: 'Vanguard wins the round', copy: 'The bomb went off at Furnace. Round 1 is yours.' });
    hud.setScore(1, 0, 1);
    hud.setTimer(OVER_TIME, 'Next');
  }
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function onLockChange(locked) {
  if (shot) return;
  audio.unlock();
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuyMenu();
    buyOpen = false;
  } else if (!rounds.state.matchOver && rounds.state.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start', {
      round: rounds.state.round,
      a: rounds.state.scoreAttack,
      d: rounds.state.scoreDefend,
    });
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.phase === 'over') {
    if (rounds.state.matchOver) {
      rounds.state.scoreAttack = 0;
      rounds.state.scoreDefend = 0;
      rounds.state.round = 1;
      rounds.state.money = 800;
      rounds.state.matchOver = false;
      rounds.state.matchWinner = null;
      rounds.state.kills = 0;
      rounds.state.deaths = 0;
      frozen = false;
      resetRound();
    } else {
      rounds.nextRound();
      resetRound();
    }
  }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRound();
syncCamera();
// A small debug handle for play-testing: the live game state, read-only enough to
// inspect from a console or an automation script.
window.__ember = {
  player,
  bots,
  rounds,
  bomb,
  arsenal,
  input,
  get phase() { return rounds.state.phase; },
  get alive() { return { player: player.state.alive, attack: bots.aliveCount('attack'), defend: bots.aliveCount('defend') }; },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
