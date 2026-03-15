import {
  AccelerateCommand,
  ReverseCommand,
  BrakeCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { TankDetails } from './helpers';
import type { EnvironmentMessage, StepState, Vector } from './messages';

// ── Utility functions ────────────────────────────────────────────────

function angleTo(from: Vector, to: Vector): number {
  const dx = to.X - from.X;
  const dy = to.Y - from.Y;
  // 0° = north, clockwise positive
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

function maxBodyRotation(velocity: number): number {
  return 10 - 0.75 * Math.min(Math.abs(velocity), 8);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function estimateVelocity(scans: TankDetails[]): Vector | null {
  if (scans.length < 2) return null;
  const a = scans[scans.length - 2]!;
  const b = scans[scans.length - 1]!;
  const stepDiff = b.Step - a.Step;
  if (stepDiff <= 0 || stepDiff > 8) return null;
  return {
    X: (b.Location.X - a.Location.X) / stepDiff,
    Y: (b.Location.Y - a.Location.Y) / stepDiff,
  };
}

function isHeadingToward(heading: number, wallAngle: number): boolean {
  return Math.abs(angleDiff(heading, wallAngle)) < 90;
}

// ── Per-bot persistent state (each bot gets its own module instance) ─

let sweepDirection: 1 | -1 = 1;
let sweepHoldCounter = 0;
const SWEEP_HOLD_MIN = 18;

let targetTankId: number | null = null;
let targetLostCounter = 0;
const TARGET_LOST_THRESHOLD = 15;

let stepsSinceLastFire = 100; // start high so we're eager to fire

const WALL_MARGIN = 80;           // patrol zone — stay this far from walls
const WALL_HARD_LIMIT = 25;       // emergency: never get closer than this
const CORNER_FLIP_DIST = 80;      // flip direction when this close to the END wall of the patrol
const FIRE_ALIGNMENT_THRESHOLD = 15;

let wallPatrolForward = true;     // true = accelerate, false = reverse for wall patrol

// ── Main strategy ────────────────────────────────────────────────────

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
  allObservedTankScanEvents: Record<number, TankDetails[]>
): IStepCommand {
  const tank = state.Tank;
  const mapW = environment.MapSize.Width;
  const mapH = environment.MapSize.Height;
  const center: Vector = { X: mapW / 2, Y: mapH / 2 };

  stepsSinceLastFire++;

  // ── Update target tracking ──────────────────────────────────────
  const enemyScans = state.TankScans.filter(s => s.IsEnemy);
  const friendlyScans = state.TankScans.filter(s => !s.IsEnemy);

  if (targetTankId !== null) {
    const targetSeen = enemyScans.find(s => s.TankId === targetTankId);
    if (targetSeen) {
      targetLostCounter = 0;
    } else {
      targetLostCounter++;
      if (targetLostCounter > TARGET_LOST_THRESHOLD) {
        targetTankId = null;
      }
    }
  }

  // Acquire new target if none
  if (targetTankId === null && enemyScans.length > 0) {
    // Prefer lowest-health enemy
    const sorted = [...enemyScans].sort((a, b) => a.Health.Value - b.Health.Value);
    targetTankId = sorted[0]!.TankId;
    targetLostCounter = 0;
  }

  // ── Get target info for aiming ──────────────────────────────────
  let targetAngle: number | null = null;
  let targetDist: number | null = null;

  if (targetTankId !== null) {
    const scans = allObservedTankScanEvents[targetTankId];
    if (scans && scans.length > 0) {
      const latest = scans[scans.length - 1]!;
      let aimPos = latest.Location;

      // Predictive aim: estimate where enemy will be when bullet arrives
      const vel = estimateVelocity(scans);
      if (vel) {
        const dist = distanceTo(tank.Location, latest.Location);
        const bulletTravelSteps = dist / 15;
        aimPos = {
          X: latest.Location.X + vel.X * bulletTravelSteps,
          Y: latest.Location.Y + vel.Y * bulletTravelSteps,
        };
      }

      targetAngle = angleTo(tank.Location, aimPos);
      targetDist = distanceTo(tank.Location, aimPos);
    }
  }

  // ── Friendly fire check ─────────────────────────────────────────
  function isFriendlyInLineOfFire(): boolean {
    for (const ally of friendlyScans) {
      const allyAngle = angleTo(tank.Location, ally.Location);
      const allyDist = distanceTo(tank.Location, ally.Location);
      if (
        Math.abs(angleDiff(tank.TurretHeading, allyAngle)) < 10 &&
        (targetDist === null || allyDist < targetDist)
      ) {
        return true;
      }
    }
    return false;
  }

  // ── 1. FIRE — highest action priority ───────────────────────────
  const gunReady = tank.GunEnergy.Value >= tank.GunEnergy.Max;

  // Widen alignment threshold when we haven't fired in a long time (be more trigger-happy)
  const fireThreshold = stepsSinceLastFire > 50 ? FIRE_ALIGNMENT_THRESHOLD + 5 : FIRE_ALIGNMENT_THRESHOLD;

  if (gunReady && targetAngle !== null) {
    const turretDiffToTarget = Math.abs(angleDiff(tank.TurretHeading, targetAngle));
    if (turretDiffToTarget < fireThreshold && !isFriendlyInLineOfFire()) {
      stepsSinceLastFire = 0;
      return new FireGunCommand();
    }
  }

  // ── 2. WALL PATROL — stay parallel, go back and forth ─────────
  const distLeft = tank.Location.X;
  const distRight = mapW - tank.Location.X;
  const distTop = tank.Location.Y;
  const distBottom = mapH - tank.Location.Y;

  type WallInfo = { dist: number; wallAngle: number; parallel: [number, number] };
  const walls: WallInfo[] = [
    { dist: distLeft, wallAngle: 270, parallel: [0, 180] },     // left wall → patrol N/S
    { dist: distRight, wallAngle: 90, parallel: [0, 180] },     // right wall → patrol N/S
    { dist: distTop, wallAngle: 0, parallel: [90, 270] },       // top wall → patrol E/W
    { dist: distBottom, wallAngle: 180, parallel: [90, 270] },   // bottom wall → patrol E/W
  ];

  // Emergency hard limit: if extremely close and heading into wall, rotate parallel immediately
  for (const wall of walls) {
    if (wall.dist < WALL_HARD_LIMIT && isHeadingToward(tank.Heading, wall.wallAngle)) {
      const diffA = Math.abs(angleDiff(tank.Heading, wall.parallel[0]));
      const diffB = Math.abs(angleDiff(tank.Heading, wall.parallel[1]));
      const targetParallel = diffA <= diffB ? wall.parallel[0] : wall.parallel[1];
      let diff = angleDiff(tank.Heading, targetParallel);
      const maxRot = maxBodyRotation(tank.Velocity);
      diff = clamp(diff, -maxRot, maxRot);
      return new RotateCommand(diff);
    }
  }

  // Find nearest wall — is it within patrol zone?
  const sortedWalls = [...walls].sort((a, b) => a.dist - b.dist);
  const nearestWall = sortedWalls[0]!;
  // Determine if we're in wall-patrol mode and what movement command to use
  let wallPatrolCommand: AccelerateCommand | ReverseCommand | null = null;

  if (nearestWall.dist < WALL_MARGIN) {
    // Pick the parallel heading closest to our current heading
    const diffA = Math.abs(angleDiff(tank.Heading, nearestWall.parallel[0]));
    const diffB = Math.abs(angleDiff(tank.Heading, nearestWall.parallel[1]));
    const targetParallel = diffA <= diffB ? nearestWall.parallel[0] : nearestWall.parallel[1];

    const headingDiffToParallel = angleDiff(tank.Heading, targetParallel);

    if (Math.abs(headingDiffToParallel) > 8) {
      // Not yet parallel — rotate to align with the wall
      const maxRot = maxBodyRotation(tank.Velocity);
      const rot = clamp(headingDiffToParallel, -maxRot, maxRot);
      return new RotateCommand(rot);
    }

    // Already parallel — check if we should flip direction
    // Figure out the actual direction of travel
    const effectiveHeading = tank.Velocity >= 0 ? tank.Heading : (tank.Heading + 180) % 360;

    // Only check the END walls (perpendicular to our patrol wall)
    // If patrolling along a vertical wall (N/S), check top+bottom walls
    // If patrolling along a horizontal wall (E/W), check left+right walls
    const endWalls = walls.filter(w => {
      // End walls are the ones whose wallAngle is perpendicular to our patrol direction
      // i.e. walls we'd crash into while moving parallel to our nearest wall
      const isParallelToNearestWall =
        w.wallAngle === nearestWall.parallel[0] || w.wallAngle === nearestWall.parallel[1];
      return !isParallelToNearestWall;
    });

    // Flip only when close to an end wall we're heading toward
    if (Math.abs(tank.Velocity) > 1) {
      for (const ew of endWalls) {
        if (ew.dist < CORNER_FLIP_DIST && isHeadingToward(effectiveHeading, ew.wallAngle)) {
          wallPatrolForward = !wallPatrolForward;
          break;
        }
      }
    }

    wallPatrolCommand = wallPatrolForward ? new AccelerateCommand() : new ReverseCommand();
  }

  // ── 3. TURRET MANAGEMENT ────────────────────────────────────────
  // Determine desired turret command
  let turretCommand: RotateTurretCommand | null = null;

  if (targetAngle !== null && targetLostCounter <= TARGET_LOST_THRESHOLD) {
    // Track mode: aim at target
    let turretDiff = angleDiff(tank.TurretHeading, targetAngle);
    turretDiff = clamp(turretDiff, -10, 10);
    turretCommand = new RotateTurretCommand(turretDiff);
  } else {
    // Sweep mode with turret recovery
    // Check if turret is pointing at a nearby wall (wasting scan area)
    const turretRad = (tank.TurretHeading * Math.PI) / 180;
    const scanDirX = Math.sin(turretRad);
    const scanDirY = -Math.cos(turretRad);

    // Approximate distance to wall in turret direction
    let wallDist = Infinity;
    if (scanDirX > 0.01) wallDist = Math.min(wallDist, (mapW - tank.Location.X) / scanDirX);
    else if (scanDirX < -0.01) wallDist = Math.min(wallDist, -tank.Location.X / scanDirX);
    if (scanDirY > 0.01) wallDist = Math.min(wallDist, (mapH - tank.Location.Y) / scanDirY);
    else if (scanDirY < -0.01) wallDist = Math.min(wallDist, -tank.Location.Y / scanDirY);

    if (wallDist < 60) {
      // Turret is pointing at a nearby wall — steer toward center
      const angleToC = angleTo(tank.Location, center);
      let turretDiff = angleDiff(tank.TurretHeading, angleToC);
      turretDiff = clamp(turretDiff, -10, 10);
      turretCommand = new RotateTurretCommand(turretDiff);
      // Reset sweep direction to match recovery
      sweepDirection = turretDiff >= 0 ? 1 : -1;
      sweepHoldCounter = 0;
    } else {
      // Normal see-saw sweep
      sweepHoldCounter++;
      if (sweepHoldCounter >= SWEEP_HOLD_MIN) {
        sweepDirection = (sweepDirection === 1 ? -1 : 1) as 1 | -1;
        sweepHoldCounter = 0;
      }
      turretCommand = new RotateTurretCommand(sweepDirection * 10);
    }
  }

  // ── 4. SPEED MANAGEMENT ─────────────────────────────────────────
  // If gun is ready and we're tracking a target, prioritize turret alignment over speed
  const absVel = Math.abs(tank.Velocity);
  const urgentTracking = gunReady && targetAngle !== null && turretCommand !== null;

  // During wall patrol the movement command is already decided (accel/reverse);
  // only spend a step on speed if we're NOT in wall patrol mode and too slow
  if (!wallPatrolCommand && absVel < 6 && !urgentTracking) {
    return new AccelerateCommand();
  }

  // ── 5. TURRET COMMAND (at speed, not near wall, didn't fire) ───
  if (turretCommand) {
    return turretCommand;
  }

  // ── 6. POWER-UP APPROACH (opportunistic) ────────────────────────
  const healingPowerups = state.PowerupScans.filter(p => p.Type === 'Healing');
  if (healingPowerups.length > 0 && tank.Health.Value < tank.Health.Max) {
    const nearest = healingPowerups.reduce((best, p) => {
      const d = distanceTo(tank.Location, p.Location);
      const bd = distanceTo(tank.Location, best.Location);
      return d < bd ? p : best;
    });
    const pupAngle = angleTo(tank.Location, nearest.Location);
    const headingDiff = Math.abs(angleDiff(tank.Heading, pupAngle));
    if (headingDiff < 40 && distanceTo(tank.Location, nearest.Location) < 200) {
      let diff = angleDiff(tank.Heading, pupAngle);
      const maxRot = maxBodyRotation(tank.Velocity);
      diff = clamp(diff, -maxRot, maxRot);
      return new RotateCommand(diff);
    }
  }

  // ── 7. Default: wall patrol command if active, otherwise accelerate
  return wallPatrolCommand ?? new AccelerateCommand();
}
