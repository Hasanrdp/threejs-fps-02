// The arsenal: four guns and a frag grenade. It owns the numbers (damage, magazine,
// spread, recoil, price) and the view model; main.js owns the ray and the damage.
// Spread grows with movement speed, so stopping to aim pays; crouching tightens it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  {
    id: 'pistol', slot: 1, name: 'P9 Sidearm', price: 0,
    damage: 26, headMult: 3.0, mag: 12, reserve: 48, gap: 0.16, auto: false,
    reload: 1.4, spreadStill: 0.0025, spreadMove: 0.02, kick: 0.011, yawKick: 0.004,
    range: 45, barrel: 0.22, scoped: false,
  },
  {
    id: 'rifle', slot: 2, name: 'AR-77', price: 2000,
    damage: 33, headMult: 3.5, mag: 30, reserve: 90, gap: 0.096, auto: true,
    reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, yawKick: 0.004,
    range: 70, barrel: 0.42, scoped: false,
  },
  {
    id: 'smg', slot: 3, name: 'VK-9', price: 900,
    damage: 22, headMult: 3.0, mag: 30, reserve: 90, gap: 0.078, auto: true,
    reload: 1.6, spreadStill: 0.004, spreadMove: 0.034, kick: 0.007, yawKick: 0.005,
    range: 40, barrel: 0.3, scoped: false,
  },
  {
    id: 'sniper', slot: 4, name: 'LW-50', price: 3000,
    damage: 95, headMult: 4.0, mag: 5, reserve: 15, gap: 1.1, auto: false,
    reload: 2.6, spreadStill: 0.0006, spreadMove: 0.06, kick: 0.03, yawKick: 0.008,
    range: 120, barrel: 0.62, scoped: true,
  },
];

export const GRENADE_PRICE = 400;
export const GRENADE_MAX = 2;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26292e'), roughness: 0.7, metalness: 0.3 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3f45'), roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.34), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
  barrel.position.set(0, 0.025, -0.17 - def.barrel / 2);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
  stock.position.set(0, -0.02, 0.26);
  model.add(receiver, barrel, stock);
  if (def.scoped) {
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), accentMat);
    scope.position.set(0, 0.08, -0.05);
    model.add(scope);
  } else {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), accentMat);
    sight.position.set(0, 0.075, -0.2);
    model.add(sight);
  }
  model.position.set(0.22, -0.19, -0.4);
  model.scale.setScalar(0.8);
  return model;
}

export function createArsenal(camera, rng) {
  const models = new Map();
  for (const def of WEAPONS) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models.set(def.id, model);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = new Map();
  for (const def of WEAPONS) {
    owned.set(def.id, { def, mag: def.mag, reserve: def.reserve, have: def.id === 'pistol' || def.id === 'rifle' });
  }
  const state = {
    current: 'rifle',
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 1,
    grenadeCooldown: 0,
  };
  models.get('rifle').visible = true;

  function currentDef() {
    return owned.get(state.current).def;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.grenadeCooldown = Math.max(0, state.grenadeCooldown - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models.get(state.current);
    model.position.z = -0.4 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const def = currentDef();
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = owned.get(state.current);
        const need = def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    step,
    def() {
      return currentDef();
    },
    ammo() {
      const slot = owned.get(state.current);
      return { mag: slot.mag, reserve: slot.reserve };
    },
    ready() {
      const slot = owned.get(state.current);
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      const slot = owned.get(state.current);
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    reload() {
      const slot = owned.get(state.current);
      const def = currentDef();
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed, crouching) {
      const def = currentDef();
      const move = Math.min(1, speed / 5.4);
      let s = def.spreadStill + move * def.spreadMove;
      if (crouching) s *= 0.6;
      return s;
    },
    switchTo(id) {
      if (!owned.get(id)?.have || state.current === id || state.reloadLeft > 0) return false;
      models.get(state.current).visible = false;
      state.current = id;
      models.get(id).visible = true;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id, money) {
      const def = WEAPONS.find((w) => w.id === id);
      if (!def) return { ok: false, reason: 'no such weapon' };
      const slot = owned.get(id);
      if (slot.have) return { ok: false, reason: 'already owned' };
      if (money < def.price) return { ok: false, reason: 'not enough money' };
      slot.have = true;
      slot.mag = def.mag;
      slot.reserve = def.reserve;
      return { ok: true, cost: def.price };
    },
    buyGrenade(money) {
      if (state.grenades >= GRENADE_MAX) return { ok: false, reason: 'grenade pouch full' };
      if (money < GRENADE_PRICE) return { ok: false, reason: 'not enough money' };
      state.grenades += 1;
      return { ok: true, cost: GRENADE_PRICE };
    },
    buyArmor(money) {
      if (money < 650) return { ok: false, reason: 'not enough money' };
      return { ok: true, cost: 650 };
    },
    canThrowGrenade() {
      return state.grenades > 0 && state.grenadeCooldown === 0 && state.reloadLeft === 0;
    },
    throwGrenade() {
      if (!this.canThrowGrenade()) return false;
      state.grenades -= 1;
      state.grenadeCooldown = 0.8;
      return true;
    },
    refill() {
      for (const slot of owned.values()) {
        slot.mag = slot.def.mag;
        slot.reserve = slot.def.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenades = 1;
      state.grenadeCooldown = 0;
    },
  };
}
