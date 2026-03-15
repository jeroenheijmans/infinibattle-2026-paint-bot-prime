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
let seeSawModeAge = 0;          // steps in current see-saw mode
let turretSweepDir: 1 | -1 = 1; // +1=clockwise, -1=counter-clockwise
let turretSweepSteps = 0;        // steps since last turret-sweep reversal
let bodyRotateHold = 0;          // cooldown after wall-avoidance rotate (steps)

const WALL_MARGIN = 40;
const MIN_SWEEP_HOLD = 10;       // anti-flap: minimum steps before sweep can reverse
const SWEEP_SPEED = 8;           // degrees/step for turret sweep
const BULLET_SPEED = 15;         // units/step
const LOW_SPEED_THRESHOLD = 4;   // if |velocity| < this, prioritise movement
const SEE_SAW_THRESHOLD = 7;     // speed that triggers an immediate mode flip
const SEE_SAW_MAX_AGE = 60;      // force mode flip after this many steps (≈2.4 s)
const SCAN_RECOVER_DIST = 150;   // reverse sweep if next heading exits map sooner than this

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function normalizeAngle360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Wrap to (-180, 180] — the shortest signed delta */
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
function projectedScanDist(
  turretHeading: number,
  loc: Vector,
  w: number,
  h: number
): number {
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

/** True when `heading` is within 60° of `wallDir`. */
function isTowardWall(heading: number, wallDir: number): boolean {
  return Math.abs(normalizeAngleDelta(heading - wallDir)) < 60;
}

/** Pick the enemy that is lowest health (then nearest). */
function pickBestTarget(
  enemyScans: TankScanEvent[],
  myLoc: Vector
): TankScanEvent | null {
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
      const d = dist(myLoc, target.Location);
      const travelTime = d / BULLET_SPEED;
      return {
        X: target.Location.X + velX * travelTime,
        Y: target.Location.Y + velY * travelTime,
      };
    }
  }
  return target.Location; // fallback: no prediction
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

  // ── 1. Emergency wall avoidance (highest priority) ─────────
  if (bodyRotateHold > 0) {
    bodyRotateHold--;
  } else {
    let wallRot: number | null = null;

    if (Y < WALL_MARGIN && isTowardWall(heading, 0)) {
      // Near north wall, heading north → rotate toward E or W
      const dE = normalizeAngleDelta(90 - heading);
      const dW = normalizeAngleDelta(270 - heading);
      wallRot = Math.abs(dE) <= Math.abs(dW) ? Math.sign(dE) * 10 : Math.sign(dW) * 10;
    } else if (Y > H - WALL_MARGIN && isTowardWall(heading, 180)) {
      const dE = normalizeAngleDelta(90 - heading);
      const dW = normalizeAngleDelta(270 - heading);
      wallRot = Math.abs(dE) <= Math.abs(dW) ? Math.sign(dE) * 10 : Math.sign(dW) * 10;
    } else if (X > W - WALL_MARGIN && isTowardWall(heading, 90)) {
      const dN = normalizeAngleDelta(0 - heading);
      const dS = normalizeAngleDelta(180 - heading);
      wallRot = Math.abs(dN) <= Math.abs(dS) ? Math.sign(dN) * 10 : Math.sign(dS) * 10;
    } else if (X < WALL_MARGIN && isTowardWall(heading, 270)) {
      const dN = normalizeAngleDelta(0 - heading);
      const dS = normalizeAngleDelta(180 - heading);
      wallRot = Math.abs(dN) <= Math.abs(dS) ? Math.sign(dN) * 10 : Math.sign(dS) * 10;
    }

    if (wallRot !== null && wallRot !== 0) {
      bodyRotateHold = 5;
      return new RotateCommand(wallRot);
    }
  }

  // ── Update see-saw mode ────────────────────────────────────
  seeSawModeAge++;
  const forceFlip = seeSawModeAge >= SEE_SAW_MAX_AGE;
  const speedFlip =
    (seeSawMode === "accelerate" && tank.Velocity >= SEE_SAW_THRESHOLD) ||
    (seeSawMode === "reverse" && tank.Velocity <= -SEE_SAW_THRESHOLD);

  if (forceFlip || speedFlip) {
    seeSawMode = seeSawMode === "accelerate" ? "reverse" : "accelerate";
    seeSawModeAge = 0;
  }

  const moveCmd = (): IStepCommand =>
    seeSawMode === "accelerate" ? new AccelerateCommand() : new ReverseCommand();

  // ── 2. Identify enemies in scan ────────────────────────────
  const enemyScans = state.TankScans.filter(s => s.IsEnemy);
  const hasEnemy = enemyScans.length > 0;

  // ── 3. Fire if gun ready and turret aligned on an enemy ────
  if (tank.GunEnergy.Value >= tank.GunEnergy.Max && hasEnemy) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const aimAngle = angleTo(tank.Location, target.Location);
      const diff = Math.abs(normalizeAngleDelta(aimAngle - turretH));
      if (diff <= 5) {
        return new FireGunCommand();
      }
    }
  }

  // ── 4. Restore speed if too slow (beats turret ops) ────────
  if (Math.abs(tank.Velocity) < LOW_SPEED_THRESHOLD) {
    return moveCmd();
  }

  // ── 5. Lock & predict on enemy OR sweep ────────────────────
  if (hasEnemy) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const predicted = predictLocation(target, tank.Location, allObservedTankScanEvents);
      const desiredAngle = angleTo(tank.Location, predicted);
      const delta = normalizeAngleDelta(desiredAngle - turretH);
      const clamped = Math.max(-10, Math.min(10, delta));
      turretSweepSteps = 0; // not sweeping while tracking
      return new RotateTurretCommand(clamped);
    }
  }

  // ── 6. Turret sweep (anti-flap enforced) ───────────────────
  {
    turretSweepSteps++;

    // Only consider reversing after the mandatory hold period
    if (turretSweepSteps >= MIN_SWEEP_HOLD) {
      const nextTurretH = normalizeAngle360(turretH + turretSweepDir * SWEEP_SPEED);
      const nextDist = projectedScanDist(nextTurretH, tank.Location, W, H);

      if (nextDist < SCAN_RECOVER_DIST) {
        // Turret would aim at a near wall — flip sweep direction
        turretSweepDir = (turretSweepDir * -1) as 1 | -1;
        turretSweepSteps = 0;
      } else if (turretSweepSteps >= MIN_SWEEP_HOLD * 3) {
        // Regular cycle: reverse after 3× hold period
        turretSweepDir = (turretSweepDir * -1) as 1 | -1;
        turretSweepSteps = 0;
      }
    }

    return new RotateTurretCommand(turretSweepDir * SWEEP_SPEED);
  }
}
