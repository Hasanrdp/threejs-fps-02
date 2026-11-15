// Emberworks: an industrial foundry yard, built from boxes. Two bomb sites, three
// lanes, cover to crouch behind and corners to hold. Every solid box is a collider
// for bodies and a surface a bullet stops on; decoration never blocks a shot.
// North is -z (defenders), south is +z (attackers). Site A is the furnace in the
// north-east, site B the container yard in the north-west, mid joins them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.6;

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {};
  const defs = {
    floor: { color: '#2e2820', roughness: 0.95, metalness: 0.02 },
    wall: { color: '#372d1f', roughness: 0.9, metalness: 0.05 },
    cover: { color: PALETTE.hairline, roughness: 0.85, metalness: 0.08 },
    crate: { color: PALETTE.brass, roughness: 0.8, metalness: 0.15 },
    container: { color: PALETTE.steel, roughness: 0.6, metalness: 0.4 },
    containerB: { color: PALETTE.accent, roughness: 0.6, metalness: 0.35 },
    furnace: { color: '#241a12', roughness: 0.7, metalness: 0.5 },
    glow: { color: PALETTE.ember, roughness: 0.4, metalness: 0.1, emissive: PALETTE.ember, emissiveIntensity: 2.2 },
    dark: { color: '#100d0a', roughness: 0.95, metalness: 0.05 },
    stripe: { color: PALETTE.accent, roughness: 0.6, metalness: 0.1, emissive: PALETTE.accent, emissiveIntensity: 0.7 },
    stripeB: { color: PALETTE.steel, roughness: 0.6, metalness: 0.1, emissive: PALETTE.steel, emissiveIntensity: 0.7 },
  };
  for (const name of Object.keys(defs)) {
    const d = defs[name];
    mat[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color),
      roughness: d.roughness,
      metalness: d.metalness,
      emissive: d.emissive ? new THREE.Color(d.emissive) : new THREE.Color('#000000'),
      emissiveIntensity: d.emissiveIntensity ?? 0,
    });
  }

  const colliders = [];
  const shootables = [];

  // A solid box: mesh + collider + bullet surface.
  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // A flat marker on the floor: visible, never a collider, never a bullet stop.
  function strip(w, d, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat[material]);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Floor and perimeter.
  box(46.4, 0.4, 34.4, 0, -0.2, 0, 'floor');
  box(46.4, WALL_H, 0.4, 0, WALL_H / 2, -17.2, 'wall');
  box(46.4, WALL_H, 0.4, 0, WALL_H / 2, 17.2, 'wall');
  box(0.4, WALL_H, 34.4, -23.2, WALL_H / 2, 0, 'wall');
  box(0.4, WALL_H, 34.4, 23.2, WALL_H / 2, 0, 'wall');

  // Site A — the furnace, north-east. A big iron body, a glowing mouth and a stack.
  box(5.5, 5.0, 3.2, 16, 2.5, -13.2, 'furnace');
  box(1.6, 7.5, 1.6, 18.5, 3.75, -14.5, 'dark');
  box(3.4, 1.5, 0.3, 16, 1.1, -11.5, 'glow', false);
  box(2.2, 1.1, 1.2, 11.5, 0.55, -9.5, 'crate');
  box(1.2, 1.1, 2.4, 19.5, 0.55, -8.0, 'cover');
  box(1.2, 2.2, 1.2, 12.5, 1.1, -13.5, 'cover');
  strip(7, 7, 14, -10, 'stripe');

  // Site B — the container yard, north-west. Two boxes and one stacked on top.
  box(6.0, 2.6, 2.6, -17, 1.3, -11.5, 'container');
  box(6.0, 2.6, 2.6, -17, 3.9, -11.5, 'containerB');
  box(6.0, 2.6, 2.6, -17, 1.3, -6.8, 'containerB');
  box(2.2, 1.1, 1.2, -11.5, 0.55, -9.5, 'crate');
  box(1.2, 1.1, 2.4, -10.5, 0.55, -13.0, 'cover');
  strip(7, 7, -14, -10, 'stripeB');

  // Mid: a pillar to fight around, a low gantry you can jump onto, and lane cover.
  box(1.4, 3.4, 1.4, 0, 1.7, 0, 'cover');
  box(6.0, 0.9, 3.0, 0, 0.45, 6.5, 'cover');
  box(2.0, 1.1, 1.2, -4.5, 0.55, 2.5, 'crate');
  box(2.0, 1.1, 1.2, 4.5, 0.55, -2.5, 'crate');
  box(1.2, 1.1, 3.6, -7.5, 0.55, -4.0, 'cover');
  box(1.2, 1.1, 3.6, 7.5, 0.55, 4.0, 'cover');

  // East lane (to A): a wall corner and a crate to tuck behind.
  box(1.2, 2.2, 4.0, 18.5, 1.1, -2.0, 'cover');
  box(2.4, 1.1, 1.2, 17.0, 0.55, 4.5, 'crate');
  box(1.2, 1.6, 1.2, 20.0, 0.8, 8.5, 'cover');
  // West lane (to B): the mirror.
  box(1.2, 2.2, 4.0, -18.5, 1.1, -2.0, 'cover');
  box(2.4, 1.1, 1.2, -17.0, 0.55, 4.5, 'crate');
  box(1.2, 1.6, 1.2, -20.0, 0.8, 8.5, 'cover');

  // South (attacker) side: two low blocks to stage behind.
  box(2.4, 0.9, 1.2, -5.0, 0.45, 11.5, 'cover');
  box(2.4, 0.9, 1.2, 5.0, 0.45, 11.5, 'cover');
  // North (defender) side: a spine wall between the sites.
  box(8.0, 2.4, 1.0, 0, 1.2, -14.5, 'wall');

  // Lighting: warm dusk key with shadows, a cool fill, furnace fire and yard cold.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a5e'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffe6bf'), 2.7);
  key.position.set(14, 18, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.steel), 0.8);
  fill.position.set(-12, 10, 12);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 90, 24, 1.8);
  furnaceLight.position.set(15, 2.0, -10.5);
  scene.add(furnaceLight);
  const yardLight = new THREE.PointLight(new THREE.Color(PALETTE.steel), 45, 20, 1.8);
  yardLight.position.set(-14, 3.0, -9.0);
  scene.add(yardLight);
  const midLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 28, 16, 1.8);
  midLight.position.set(0, 3.5, 3.0);
  scene.add(midLight);

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { name: 'Furnace', center: new THREE.Vector3(14, 0, -10), radius: 4.2 },
      B: { name: 'Yard', center: new THREE.Vector3(-14, 0, -10), radius: 4.2 },
    },
    spawns: {
      attack: [
        new THREE.Vector3(0, 0, 13.5),
        new THREE.Vector3(-3.5, 0, 14.5),
        new THREE.Vector3(3.5, 0, 14.5),
      ],
      defend: [
        new THREE.Vector3(0, 0, -12.5),
        new THREE.Vector3(-9, 0, -12.0),
        new THREE.Vector3(9, 0, -12.0),
      ],
    },
    // Bot routes: waypoints from spawn to a holding post.
    routes: {
      toA: [
        new THREE.Vector3(10, 0, 10),
        new THREE.Vector3(16, 0, 2),
        new THREE.Vector3(13, 0, -6),
        new THREE.Vector3(11.5, 0, -8.5),
      ],
      toB: [
        new THREE.Vector3(-10, 0, 10),
        new THREE.Vector3(-16, 0, 2),
        new THREE.Vector3(-13, 0, -6),
        new THREE.Vector3(-11.5, 0, -8.5),
      ],
      toMid: [
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(2.5, 0, 2),
        new THREE.Vector3(0, 0, -4),
      ],
      holdA: [new THREE.Vector3(12, 0, -8), new THREE.Vector3(17, 0, -6)],
      holdB: [new THREE.Vector3(-12, 0, -8), new THREE.Vector3(-17, 0, -6)],
      holdMid: [new THREE.Vector3(-3, 0, -5), new THREE.Vector3(3, 0, -5)],
    },
  };
}
