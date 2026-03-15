import {
  AccelerateCommand,
  ReverseCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { TankDetails } from './helpers';
import type { EnvironmentMessage, StepState, TankScanEvent, Vector } from './messages';

// ─────────────────────────────────────────────────────────────
// Module-level state (each bot runs as its own process)
// ─────────────────────────────────────────────────────────────

let seeSawMode: "accelerate" | "reverse" = "accelerate";
let turretSweepDir: 1 | -1 = 1;
let turretSweepSteps = 0;
let softRotHold = 0;          // anti-flap hold for soft heading corrections
let assignedHeading: number | null = null; // set once from tankId % 3

// Assigned travel axis per local bot index (tankId % 3)
// 0 → East (90°), 1 → North (0°), 2 → SE diagonal (135°)
const ASSIGNED_HEADINGS = [90, 0, 135] as const;

const WALL_EMERGENCY = 40;    // distance threshold for emergency wall rotation
const WALL_SOFT = 80;         // distance threshold for soft heading correction
const MIN_SWEEP_HOLD = 10;    // min steps before turret sweep can reverse direction
const SWEEP_SPEED = 8;        // degrees/step for turret sweep
const BULLET_SPEED = 15;      // units/step
const SEE_SAW_FLIP = 7.5;     // flip see-saw mode when |velocity| reaches this
const TARGET_SPEED = 7.2;     // 90% of max speed (8) — must stay at or above this
const SCAN_RECOVER_DIST = 150; // flip sweep if next heading exits map sooner than this

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function normalizeAngle360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Wrap to (-180, 180] — the shortest signed delta. */
function normalizeAngleDelta(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Bearing from `from` to `to` in game coords (0=North, CW). */
function angleTo(from: Vector, to: Vector): number {
  const dx = to.X - from.X;
  const dy = to.Y - from.Y;
  return normalizeAngle360(Math.atan2(dx, -dy) * (180 / Math.PI));
}

function dist(a: Vector, b: Vector): number {
  const dx = a.X - b.X;
  const dy = a.Y - b.Y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance the turret ray travels before hitting a map boundary. */
function projectedScanDist(turretHeading: number, loc: Vector, w: number, h: number): number {
  const rad = (turretHeading * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ts: number[] = [];
  if (dx > 0.001) ts.push((w - loc.X) / dx);
  else if (dx < -0.001) ts.push(-loc.X / dx);
  if (dy > 0.001) ts.push((h - loc.Y) / dy);
  else if (dy < -0.001) ts.push(-loc.Y / dy);
  return ts.length > 0 ? Math.min(...ts) : 9999;
}

/** True when `heading` is within 50° of `wallDir` (i.e. heading toward that wall). */
function isTowardWall(heading: number, wallDir: number): boolean {
  return Math.abs(normalizeAngleDelta(heading - wallDir)) < 50;
}

/**
 * Rotate toward the closer of two parallel headings.
 * Returns a signed rotation clamped to ±10° (max body rotation).
 */
function rotateToward(heading: number, parallelA: number, parallelB: number): number {
  const dA = normalizeAngleDelta(parallelA - heading);
  const dB = normalizeAngleDelta(parallelB - heading);
  const delta = Math.abs(dA) <= Math.abs(dB) ? dA : dB;
  return Math.sign(delta) * Math.min(10, Math.abs(delta));
}

/** Pick the enemy with lowest health, breaking ties by proximity. */
function pickBestTarget(enemyScans: TankScanEvent[], myLoc: Vector): TankScanEvent | null {
  const sorted = enemyScans.slice().sort((a, b) => {
    if (a.Health.Value !== b.Health.Value) return a.Health.Value - b.Health.Value;
    return dist(myLoc, a.Location) - dist(myLoc, b.Location);
  });
  return sorted[0] ?? null;
}

/** Predict where `target` will be when a bullet fired now arrives. */
function predictLocation(
  target: TankScanEvent,
  myLoc: Vector,
  history: Record<number, TankDetails[]>
): Vector {
  const scans = history[target.TankId];
  if (scans && scans.length >= 2) {
    const s1 = scans[scans.length - 2];
    const s2 = scans[scans.length - 1];
    if (s1 && s2 && s2.Step - s1.Step <= 8) {
      const dt = s2.Step - s1.Step;
      const velX = (s2.Location.X - s1.Location.X) / dt;
      const velY = (s2.Location.Y - s1.Location.Y) / dt;
      const travelTime = dist(myLoc, target.Location) / BULLET_SPEED;
      return {
        X: target.Location.X + velX * travelTime,
        Y: target.Location.Y + velY * travelTime,
      };
    }
  }
  return target.Location;
}

/**
 * Soft heading correction: steer toward assigned axis in open field,
 * or toward wall-parallel heading when near a wall.
 * Returns 0 if already well-aligned (error < 5°).
 */
function softHeadingCorrection(
  heading: number,
  loc: Vector,
  w: number,
  h: number,
  assigned: number
): number {
  const nearNS = loc.Y < WALL_SOFT || loc.Y > h - WALL_SOFT;
  const nearEW = loc.X < WALL_SOFT || loc.X > w - WALL_SOFT;

  let rot: number;
  if (nearNS && nearEW) {
    // Corner — align to whichever wall is closer
    const distNS = Math.min(loc.Y, h - loc.Y);
    const distEW = Math.min(loc.X, w - loc.X);
    rot = distNS < distEW
      ? rotateToward(heading, 90, 270)  // closer to N/S wall → E-W parallel
      : rotateToward(heading, 0, 180);  // closer to E/W wall → N-S parallel
  } else if (nearNS) {
    rot = rotateToward(heading, 90, 270);  // near N/S wall → E-W parallel
  } else if (nearEW) {
    rot = rotateToward(heading, 0, 180);   // near E/W wall → N-S parallel
  } else {
    // Open field — align to assigned axis (or its 180° opposite)
    rot = rotateToward(heading, assigned, (assigned + 180) % 360);
  }

  // Ignore tiny errors (< 5°) to avoid perpetual micro-adjustments
  return Math.abs(rot) >= 5 ? rot : 0;
}

// ─────────────────────────────────────────────────────────────
// Main strategy
// ─────────────────────────────────────────────────────────────

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
  allObservedTankScanEvents: Record<number, TankDetails[]>
): IStepCommand {
  const tank = state.Tank;
  const { X, Y } = tank.Location;
  const { Width: W, Height: H } = environment.MapSize;
  const heading = tank.Heading;
  const turretH = tank.TurretHeading;

  // Tick down soft correction hold unconditionally each step
  if (softRotHold > 0) softRotHold--;

  // Init assigned heading from tank ID (runs exactly once per bot lifetime)
  if (assignedHeading === null) {
    assignedHeading = ASSIGNED_HEADINGS[tank.Id % 3] ?? 90;
  }

  // ── 1. Emergency wall avoidance (highest priority, always runs) ──
  // Self-limiting: once heading is parallel, isTowardWall returns false.
  if (Y < WALL_EMERGENCY && isTowardWall(heading, 0)) {
    return new RotateCommand(rotateToward(heading, 90, 270));
  }
  if (Y > H - WALL_EMERGENCY && isTowardWall(heading, 180)) {
    return new RotateCommand(rotateToward(heading, 90, 270));
  }
  if (X > W - WALL_EMERGENCY && isTowardWall(heading, 90)) {
    return new RotateCommand(rotateToward(heading, 0, 180));
  }
  if (X < WALL_EMERGENCY && isTowardWall(heading, 270)) {
    return new RotateCommand(rotateToward(heading, 0, 180));
  }

  // ── Update see-saw mode (flip at ±7.5) ───────────────────
  if (seeSawMode === "accelerate" && tank.Velocity >= SEE_SAW_FLIP) {
    seeSawMode = "reverse";
  } else if (seeSawMode === "reverse" && tank.Velocity <= -SEE_SAW_FLIP) {
    seeSawMode = "accelerate";
  }

  const moveCmd = (): IStepCommand =>
    seeSawMode === "accelerate" ? new AccelerateCommand() : new ReverseCommand();

  // ── 2. Fire (priority #1 per strategy, after emergency only) ──
  const enemyScans = state.TankScans.filter(s => s.IsEnemy);
  if (tank.GunEnergy.Value >= tank.GunEnergy.Max && enemyScans.length > 0) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const aimAngle = angleTo(tank.Location, target.Location);
      const diff = Math.abs(normalizeAngleDelta(aimAngle - turretH));
      if (diff <= 5) {
        return new FireGunCommand();
      }
    }
  }

  // ── 3. Speed maintenance — always stay at ≥90% of max ────
  // In "accelerate" mode: push toward +7.2. In "reverse" mode: push toward -7.2.
  const needsSpeed =
    (seeSawMode === "accelerate" && tank.Velocity < TARGET_SPEED) ||
    (seeSawMode === "reverse" && tank.Velocity > -TARGET_SPEED);
  if (needsSpeed) {
    return moveCmd();
  }

  // ── At near-max speed — turret/correction window ──────────

  // ── 4. Soft heading correction (ID-based spread + wall-parallel) ──
  if (softRotHold === 0) {
    const rot = softHeadingCorrection(heading, tank.Location, W, H, assignedHeading);
    if (rot !== 0) {
      softRotHold = 4;
      return new RotateCommand(rot);
    }
  }

  // ── 5. Turret: lock & predict on enemy ───────────────────
  if (enemyScans.length > 0) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const predicted = predictLocation(target, tank.Location, allObservedTankScanEvents);
      const desiredAngle = angleTo(tank.Location, predicted);
      const delta = normalizeAngleDelta(desiredAngle - turretH);
      const clamped = Math.max(-10, Math.min(10, delta));
      turretSweepSteps = 0;
      return new RotateTurretCommand(clamped);
    }
  }

  // ── 6. Turret sweep (anti-flap enforced) ─────────────────
  turretSweepSteps++;
  if (turretSweepSteps >= MIN_SWEEP_HOLD) {
    const nextH = normalizeAngle360(turretH + turretSweepDir * SWEEP_SPEED);
    const nextDist = projectedScanDist(nextH, tank.Location, W, H);
    if (nextDist < SCAN_RECOVER_DIST || turretSweepSteps >= MIN_SWEEP_HOLD * 3) {
      turretSweepDir = (turretSweepDir * -1) as 1 | -1;
      turretSweepSteps = 0;
    }
  }
  return new RotateTurretCommand(turretSweepDir * SWEEP_SPEED);
}

