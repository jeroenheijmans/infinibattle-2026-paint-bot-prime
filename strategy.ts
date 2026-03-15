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
let seeSawFlipCooldown = 0;    // steps before see-saw can flip again
let turretSweepDir: 1 | -1 = 1;
let turretSweepSteps = 0;
let startupAligned = false;    // true once initial heading alignment is done
let assignedHeading: number | null = null; // set once from tankId % 3

// Each bot on the team gets a different travel axis so they spread across the arena.
// (tank.Id % 3):  0 → East-West (90°),  1 → North-South (0°),  2 → NE-SW diagonal (135°)
const ASSIGNED_HEADINGS = [90, 0, 135];

const WALL_DANGER    = 40;    // emergency rotate if within this many units heading toward wall
const WALL_FLIP_DIST = 80;    // flip see-saw mode when the ahead-wall is this close
const FLIP_COOLDOWN  = 15;    // minimum steps between see-saw flips
const DIR_SPEED_MIN  = 5;     // boost speed if directional speed below this
const MIN_SWEEP_HOLD = 10;    // anti-flap: min steps before turret-sweep can reverse
const SWEEP_SPEED    = 8;     // degrees/step for turret sweep
const BULLET_SPEED   = 15;    // units/step
const SCAN_RECOVER   = 150;   // flip sweep if next step would aim closer than this to a wall

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

/** Bearing from `from` to `to` (0=North, CW). */
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

/** Distance the bot travels in `heading` direction before hitting a map boundary. */
function projectedScanDist(heading: number, loc: Vector, w: number, h: number): number {
  const rad = (heading * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const ts: number[] = [];
  if (dx > 0.001) ts.push((w - loc.X) / dx);
  else if (dx < -0.001) ts.push(-loc.X / dx);
  if (dy > 0.001) ts.push((h - loc.Y) / dy);
  else if (dy < -0.001) ts.push(-loc.Y / dy);
  return ts.length > 0 ? Math.min(...ts) : 9999;
}

/** True when heading is within 50° of wallDir (heading toward that wall). */
function isTowardWall(heading: number, wallDir: number): boolean {
  return Math.abs(normalizeAngleDelta(heading - wallDir)) < 50;
}

/** Rotate toward whichever of parallelA / parallelB is closer. Clamped to ±10°. */
function rotateToward(heading: number, parallelA: number, parallelB: number): number {
  const dA = normalizeAngleDelta(parallelA - heading);
  const dB = normalizeAngleDelta(parallelB - heading);
  const delta = Math.abs(dA) <= Math.abs(dB) ? dA : dB;
  return Math.sign(delta) * Math.min(10, Math.abs(delta));
}

/** Enemy with lowest health; ties broken by distance. */
function pickBestTarget(enemyScans: TankScanEvent[], myLoc: Vector): TankScanEvent | null {
  return enemyScans.slice().sort((a, b) => {
    if (a.Health.Value !== b.Health.Value) return a.Health.Value - b.Health.Value;
    return dist(myLoc, a.Location) - dist(myLoc, b.Location);
  })[0] ?? null;
}

/** Predict where target will be when bullet arrives. */
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

  // Tick cooldown every step
  if (seeSawFlipCooldown > 0) seeSawFlipCooldown--;

  // Initialize assigned heading once from tank ID
  if (assignedHeading === null) {
    assignedHeading = ASSIGNED_HEADINGS[tank.Id % 3] ?? 90;
  }

  // ── Startup alignment ────────────────────────────────────────
  // While the bot is still stopped at game start (v ≈ 0), rotate to the assigned
  // heading. This is the ONLY time heading is actively corrected — one clean
  // alignment at v=0 before movement begins.
  if (!startupAligned) {
    const err = normalizeAngleDelta(assignedHeading - heading);
    if (Math.abs(err) > 3 && Math.abs(tank.Velocity) < 0.5) {
      return new RotateCommand(Math.sign(err) * Math.min(10, Math.abs(err)));
    }
    startupAligned = true;  // aligned (or bot is already moving — take what we have)
  }

  // ── Priority 1: Emergency wall avoidance ────────────────────
  // Self-limiting: once parallel to the wall, isTowardWall returns false.
  if (Y < WALL_DANGER && isTowardWall(heading, 0)) {
    return new RotateCommand(rotateToward(heading, 90, 270));
  }
  if (Y > H - WALL_DANGER && isTowardWall(heading, 180)) {
    return new RotateCommand(rotateToward(heading, 90, 270));
  }
  if (X > W - WALL_DANGER && isTowardWall(heading, 90)) {
    return new RotateCommand(rotateToward(heading, 0, 180));
  }
  if (X < WALL_DANGER && isTowardWall(heading, 270)) {
    return new RotateCommand(rotateToward(heading, 0, 180));
  }

  // ── See-saw flip: proximity-based (wall-to-wall traversal) ──
  // Flip when the wall in the current direction of travel is within WALL_FLIP_DIST.
  // This ensures the bot actually crosses the whole arena rather than oscillating
  // near its starting position (what a speed-threshold flip causes).
  if (seeSawFlipCooldown === 0) {
    const travelDir = seeSawMode === "accelerate"
      ? heading
      : normalizeAngle360(heading + 180);
    if (projectedScanDist(travelDir, tank.Location, W, H) < WALL_FLIP_DIST) {
      seeSawMode = seeSawMode === "accelerate" ? "reverse" : "accelerate";
      seeSawFlipCooldown = FLIP_COOLDOWN;
    }
  }

  const moveCmd = (): IStepCommand =>
    seeSawMode === "accelerate" ? new AccelerateCommand() : new ReverseCommand();

  // ── Priority 2: Fire ─────────────────────────────────────────
  const enemyScans = state.TankScans.filter(s => s.IsEnemy);
  if (tank.GunEnergy.Value >= tank.GunEnergy.Max && enemyScans.length > 0) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const aimAngle = angleTo(tank.Location, target.Location);
      if (Math.abs(normalizeAngleDelta(aimAngle - turretH)) <= 5) {
        return new FireGunCommand();
      }
    }
  }

  // ── Priority 3: Turret (aim or sweep) ────────────────────────
  // Turret is the DEFAULT action when at speed. Speed is only boosted below
  // priority 3 so the turret gets the most steps possible.
  if (enemyScans.length > 0) {
    const target = pickBestTarget(enemyScans, tank.Location);
    if (target) {
      const predicted = predictLocation(target, tank.Location, allObservedTankScanEvents);
      const desired = angleTo(tank.Location, predicted);
      const delta = normalizeAngleDelta(desired - turretH);
      const clamped = Math.max(-10, Math.min(10, delta));
      turretSweepSteps = 0;
      return new RotateTurretCommand(clamped);
    }
  }

  // Sweep (anti-flap enforced: only check reversal after MIN_SWEEP_HOLD steps)
  turretSweepSteps++;
  if (turretSweepSteps >= MIN_SWEEP_HOLD) {
    const nextH = normalizeAngle360(turretH + turretSweepDir * SWEEP_SPEED);
    if (
      projectedScanDist(nextH, tank.Location, W, H) < SCAN_RECOVER ||
      turretSweepSteps >= MIN_SWEEP_HOLD * 3
    ) {
      turretSweepDir = (turretSweepDir * -1) as 1 | -1;
      turretSweepSteps = 0;
    }
  }

  // Only issue a turret command when there's actually some speed to spare.
  // When directional speed is too low, fall through to movement.
  const dirSpeed = seeSawMode === "accelerate" ? tank.Velocity : -tank.Velocity;
  if (dirSpeed >= DIR_SPEED_MIN) {
    return new RotateTurretCommand(turretSweepDir * SWEEP_SPEED);
  }

  // ── Priority 4 (fallback): Speed boost ───────────────────────
  // Boosting speed is a fallback. With friction = 0.98/step, a single accelerate
  // from v≈5 pushes to v≈6.7, which then decays back to 5 in ~8 turret steps —
  // so the ratio is roughly 8:1 turret:movement. Good coverage.
  return moveCmd();
}
