// Effects: tracers, impact sparks and the bomb blast. Everything is pooled and
// reused: no new object is made in a hot loop, the tracer and spark meshes are
// created once and handed out, and dead ones go back in the pool.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_MAX = 24;
const SPARK_MAX = 40;

export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color('#ffd9a0'), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });

  for (let i = 0; i < TRACER_MAX; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  for (let i = 0; i < SPARK_MAX; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const p = new THREE.Points(geo, sparkMat.clone());
    p.visible = false;
    p.frustumCulled = false;
    scene.add(p);
    sparks.push({ p, life: 0, vel: new THREE.Vector3() });
  }

  // An expanding blast ring for the bomb.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 1, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringLife = 0;

  function tracer(from, to, color) {
    let slot = tracers.find((t) => t.life <= 0);
    if (!slot) slot = tracers[0];
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.material.color.set(color);
    slot.line.material.opacity = 0.9;
    slot.line.visible = true;
    slot.life = 0.09;
  }

  function sparksAt(point, count, rng) {
    let made = 0;
    for (const s of sparks) {
      if (made >= count) break;
      if (s.life > 0) continue;
      const attr = s.p.geometry.getAttribute('position');
      attr.setXYZ(0, point.x, point.y, point.z);
      attr.needsUpdate = true;
      s.vel.set(rng.range(-2, 2), rng.range(1, 3.5), rng.range(-2, 2));
      s.p.material.opacity = 0.95;
      s.p.visible = true;
      s.life = 0.35;
      made += 1;
    }
  }

  function explosion(point) {
    ring.position.set(point.x, 0.12, point.z);
    ring.visible = true;
    ringLife = 0.7;
    sparksAt(point, 18, { range: (a, b) => a + Math.random() * (b - a) });
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const attr = s.p.geometry.getAttribute('position');
      attr.setXYZ(0, attr.getX(0) + s.vel.x * dt, Math.max(0.03, attr.getY(0) + s.vel.y * dt), attr.getZ(0) + s.vel.z * dt);
      attr.needsUpdate = true;
      s.vel.y -= 9 * dt;
      s.p.material.opacity = Math.max(0, s.life / 0.35) * 0.95;
      if (s.life <= 0) s.p.visible = false;
    }
    if (ringLife > 0) {
      ringLife -= dt;
      const k = 1 - ringLife / 0.7;
      ring.scale.setScalar(1 + k * 14);
      ring.material.opacity = Math.max(0, 0.85 * (1 - k));
      if (ringLife <= 0) ring.visible = false;
    }
  }

  return { tracer, sparksAt, explosion, step };
}
