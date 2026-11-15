// Shared body movement: a capsule approximated by a vertical box, resolved against the
// map's axis-aligned colliders one axis at a time, so a wall never swallows a body and
// a body can slide along a wall. Both the player and the bots move through here, which
// keeps their collision identical and the code in one place.
import * as THREE from 'three';

const RADIUS = 0.34;

export function makeBody(x, z, height) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    height,
    eye: height - 0.12,
    onGround: true,
  };
}

function overlapsBox(colliders, x, y, z, height, lift, probe) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// Accelerate the body toward a wish direction at a target speed, with ground friction
// when idle. Returns the horizontal speed, which weapons read for spread.
export function stepBody(body, colliders, dt, wishX, wishZ, speed, accel, friction, gravity, jumpSpeed, wantJump, probe) {
  const blend = Math.min(1, (accel * dt) / Math.max(1, speed));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  if (wantJump && body.onGround) {
    body.velocity.y = jumpSpeed;
    body.onGround = false;
  }
  body.velocity.y -= gravity * dt;

  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlapsBox(colliders, nextX, body.position.y, body.position.z, body.height, 0.04, probe)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlapsBox(colliders, body.position.x, body.position.y, nextZ, body.height, 0.04, probe)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }

  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlapsBox(colliders, body.position.x, body.position.y, body.position.z, body.height, 0, probe);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  if (body.velocity.y < -30) body.velocity.y = -30;
  return Math.hypot(body.velocity.x, body.velocity.z);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}
