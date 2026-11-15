// The bomb: the objective beyond killing. The player carries it, plants it at a
// site by holding E, and the defenders must defuse it by holding E near it. Plant
// takes 3 seconds, defuse 5, the fuse burns 30 seconds. A plant or a defuse is a
// round win for its team; the bomb exploding is an attacker win.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 30;

export function createBomb(scene, map) {
  const group = new THREE.Group();
  scene.add(group);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.24, 0.46),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(PALETTE.danger), emissiveIntensity: 0.5 }),
  );
  mesh.castShadow = true;
  mesh.visible = false;
  group.add(mesh);
  const blink = new THREE.PointLight(new THREE.Color(PALETTE.danger), 0, 8, 1.6);
  group.add(blink);

  const state = {
    status: 'carried', // carried | planted | exploded | defused
    site: null,
    plantProgress: 0,
    defuseProgress: 0,
    fuse: FUSE_TIME,
    position: new THREE.Vector3(),
    beep: 0,
  };

  function reset() {
    state.status = 'carried';
    state.site = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.fuse = FUSE_TIME;
    mesh.visible = false;
    blink.intensity = 0;
  }

  function plantAt(site, pos) {
    state.status = 'planted';
    state.site = site;
    state.position.copy(pos);
    state.fuse = FUSE_TIME;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    mesh.position.set(pos.x, 0.14, pos.z);
    mesh.visible = true;
  }

  function siteAt(pos) {
    for (const key of Object.keys(map.sites)) {
      const site = map.sites[key];
      const d = Math.hypot(pos.x - site.center.x, pos.z - site.center.z);
      if (d <= site.radius) return key;
    }
    return null;
  }

  function step(dt, time) {
    if (state.status === 'planted') {
      state.fuse = Math.max(0, state.fuse - dt);
      state.beep += dt;
      const interval = Math.max(0.25, state.fuse / FUSE_TIME);
      if (state.beep >= interval) {
        state.beep = 0;
        blink.intensity = 24;
      } else {
        blink.intensity = Math.max(0, blink.intensity - dt * 60);
      }
      blink.position.copy(mesh.position).y = 0.6;
      if (state.fuse <= 0) {
        state.status = 'exploded';
        mesh.visible = false;
        blink.intensity = 0;
      }
    }
    void time;
  }

  return {
    state,
    mesh,
    reset,
    plantAt,
    siteAt,
    step,
  };
}
