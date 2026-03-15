import {
  AccelerateCommand,
  ReverseCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { TankDetails } from './helpers';
import type { EnvironmentMessage, StepState, Vector } from './messages';

// ── Utilities ──────────────────────────────────────────────────────────

function angleTo(from: Vector, to: Vector): number {
  const dx = to.X - from.X;
  const dy = to.Y - from.Y;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function angleDiff(from: number, to: number): number {
  let d = ((to - from) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function distanceTo(a: Vector, b: Vector): number {
  return Math.sqrt((a.X - b.X) ** 2 + (a.Y - b.Y) ** 2);
}

function maxBodyRot(velocity: number): number {
  return 10 - 0.75 * Math.min(Math.abs(velocity), 8);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function estimateVelocity(scans: TankDetails[]): Vector | null {
  if (scans.length < 2) return null;
  const a = scans[scans.length - 2]!;
  const b = scans[scans.length - 1]!;
  const dt = b.Step - a.Step;
  if (dt <= 0 || dt > 8) return null;
  return {
    X: (b.Location.X - a.Location.X) / dt,
    Y: (b.Location.Y - a.Location.Y) / dt,
  };
}

// ── Persistent state ───────────────────────────────────────────────────

let sweepDir: 1 | -1 = 1;
let sweepHold = 0;
const SWEEP_HOLD = 18;

let targetId: number | null = null;
let targetLost = 0;
const TARGET_LOST_MAX = 20;

// Wall patrol: once we enter a wall zone we lock a heading (0/90/180/270)
// and go back/forth. patrolHeading=null means we haven't reached a wall yet.
let patrolHeading: number | null = null; // locked parallel heading
let patrolForward = true;                // true=accelerate, false=reverse
let justFlipped = false;                 // prevent double-flip on same corner

const WALL_MARGIN  = 90;  // enter wall patrol zone when this close
const WALL_HARD    = 30;  // emergency rotate if closer than this
const FLIP_MARGIN  = 80;  // flip patrol direction when this close to end wall
const SPEED_MIN    = 6.5; // spend a step on acceleration when below this
const FIRE_ARC     = 15;  // degrees of turret alignment needed to fire

// ── Main strategy ──────────────────────────────────────────────────────

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
  allObservedTankScanEvents: Record<number, TankDetails[]>
): IStepCommand {
  const tank = state.Tank;
  const W = environment.MapSize.Width;
  const H = environment.MapSize.Height;

  // ── Target tracking ─────────────────────────────────────────────
  const enemies = state.TankScans.filter(s => s.IsEnemy);
  const allies  = state.TankScans.filter(s => !s.IsEnemy);

  if (targetId !== null) {
    if (enemies.some(s => s.TankId === targetId)) {
      targetLost = 0;
    } else if (++targetLost > TARGET_LOST_MAX) {
      targetId = null;
    }
  }
  if (targetId === null && enemies.length > 0) {
    targetId = enemies.reduce((a, b) =>
      a.Health.Value < b.Health.Value ? a : b
    ).TankId;
    targetLost = 0;
  }

  // ── Aim calculation ──────────────────────────────────────────────
  let aimAngle: number | null = null;
  let aimDist:  number | null = null;
  if (targetId !== null) {
    const hist = allObservedTankScanEvents[targetId];
    if (hist && hist.length > 0) {
      const latest = hist[hist.length - 1]!;
      let pos = latest.Location;
      const vel = estimateVelocity(hist);
      if (vel) {
        const d = distanceTo(tank.Location, pos);
        pos = { X: pos.X + vel.X * d / 15, Y: pos.Y + vel.Y * d / 15 };
      }
      aimAngle = angleTo(tank.Location, pos);
      aimDist  = distanceTo(tank.Location, pos);
    }
  }

  // ── 1. FIRE ─────────────────────────────────────────────────────
  if (tank.GunEnergy.Value >= tank.GunEnergy.Max && aimAngle !== null) {
    const turretOff = Math.abs(angleDiff(tank.TurretHeading, aimAngle));
    const friendlyBlocking = allies.some(a => {
      const aAngle = angleTo(tank.Location, a.Location);
      const aDist  = distanceTo(tank.Location, a.Location);
      return Math.abs(angleDiff(tank.TurretHeading, aAngle)) < 10
          && (aimDist === null || aDist < aimDist);
    });
    if (turretOff < FIRE_ARC && !friendlyBlocking) {
      return new FireGunCommand();
    }
  }

  // ── Wall distances ───────────────────────────────────────────────
  const dL = tank.Location.X;
  const dR = W - tank.Location.X;
  const dT = tank.Location.Y;
  const dB = H - tank.Location.Y;

  // ── 2. Wall patrol mode ──────────────────────────────────────────
  const inWallZone = Math.min(dL, dR, dT, dB) < WALL_MARGIN;

  if (inWallZone) {
    // Lock patrol heading on first entry (or if it got cleared)
    if (patrolHeading === null) {
      // Nearest wall determines patrol axis
      const isNearLR = Math.min(dL, dR) <= Math.min(dT, dB);
      if (isNearLR) {
        // Near left or right wall — patrol north/south
        patrolHeading = Math.abs(angleDiff(tank.Heading, 0)) <= Math.abs(angleDiff(tank.Heading, 180)) ? 0 : 180;
      } else {
        // Near top or bottom wall — patrol east/west
        patrolHeading = Math.abs(angleDiff(tank.Heading, 90)) <= Math.abs(angleDiff(tank.Heading, 270)) ? 90 : 270;
      }
    }

    const hDiff = angleDiff(tank.Heading, patrolHeading);

    // Emergency: inside hard limit AND heading into that wall → rotate parallel immediately
    const headingIntoWall =
      (dL < WALL_HARD && Math.abs(angleDiff(tank.Heading, 270)) < 90) ||
      (dR < WALL_HARD && Math.abs(angleDiff(tank.Heading,  90)) < 90) ||
      (dT < WALL_HARD && Math.abs(angleDiff(tank.Heading,   0)) < 90) ||
      (dB < WALL_HARD && Math.abs(angleDiff(tank.Heading, 180)) < 90);

    if (headingIntoWall && Math.abs(hDiff) > 5) {
      const rot = clamp(hDiff, -maxBodyRot(tank.Velocity), maxBodyRot(tank.Velocity));
      return new RotateCommand(rot);
    }

    // Soft alignment: if heading is more than 10° off parallel, rotate
    if (Math.abs(hDiff) > 10) {
      const rot = clamp(hDiff, -maxBodyRot(tank.Velocity), maxBodyRot(tank.Velocity));
      return new RotateCommand(rot);
    }

    // Heading is aligned — determine if we should flip patrol direction.
    // "effectiveDir" is the actual direction of travel:
    //   patrolForward=true  → tank moves in patrolHeading direction
    //   patrolForward=false → tank moves in the opposite direction
    const effectiveDir = patrolForward
      ? patrolHeading
      : (patrolHeading + 180) % 360;

    // Only flip when close to the end wall we're currently heading toward,
    // and guard against double-flip.
    const nearEndWall =
      (effectiveDir < 45 || effectiveDir > 315) ? dT < FLIP_MARGIN :  // heading north
      (effectiveDir < 135)                       ? dR < FLIP_MARGIN :  // heading east
      (effectiveDir < 225)                       ? dB < FLIP_MARGIN :  // heading south
                                                   dL < FLIP_MARGIN;  // heading west

    if (nearEndWall && !justFlipped) {
      patrolForward = !patrolForward;
      justFlipped = true;
    } else if (!nearEndWall) {
      justFlipped = false;
    }

    // Movement: if speed is too low, spend this step on accel/reverse.
    // Otherwise fall through and let turret management take the step.
    if (Math.abs(tank.Velocity) < SPEED_MIN) {
      return patrolForward ? new AccelerateCommand() : new ReverseCommand();
    }

    // Speed is adequate — fall through to turret management below.

  } else {
    // Drifting in the open — clear patrol heading so it re-locks on next wall entry
    patrolHeading = null;
  }

  // ── 3. Turret management ─────────────────────────────────────────
  // Track enemy if we have one
  if (aimAngle !== null && targetLost <= TARGET_LOST_MAX) {
    const diff = clamp(angleDiff(tank.TurretHeading, aimAngle), -10, 10);
    return new RotateTurretCommand(diff);
  }

  // Sweep mode with wall-pointing recovery
  const tRad = (tank.TurretHeading * Math.PI) / 180;
  const tDx  = Math.sin(tRad);
  const tDy  = -Math.cos(tRad);
  let tWall = Infinity;
  if (tDx  > 0.01) tWall = Math.min(tWall, dR /  tDx);
  else if (tDx < -0.01) tWall = Math.min(tWall, dL / -tDx);
  if (tDy  > 0.01) tWall = Math.min(tWall, dB /  tDy);
  else if (tDy < -0.01) tWall = Math.min(tWall, dT / -tDy);

  if (tWall < 60) {
    // Turret pointing at a nearby wall — steer it toward arena center
    const cAngle = angleTo(tank.Location, { X: W / 2, Y: H / 2 });
    const diff = clamp(angleDiff(tank.TurretHeading, cAngle), -10, 10);
    sweepDir = diff >= 0 ? 1 : -1;
    sweepHold = 0;
    return new RotateTurretCommand(diff);
  }

  // Normal see-saw sweep with anti-flap counter
  if (++sweepHold >= SWEEP_HOLD) {
    sweepDir   = sweepDir === 1 ? -1 : 1;
    sweepHold  = 0;
  }
  return new RotateTurretCommand(sweepDir * 10);
}


