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
import type { EnvironmentMessage, StatState, StepState, Vector } from './messages';

// ─── Persistent state ────────────────────────────────────────────────────────

let sweepDirection: number = 1;        // +1 = CW, -1 = CCW
let sweepHoldCount: number = 0;        // steps since last reversal
let bodyTurnDirection: number = 1;     // +1 = CW, -1 = CCW for wall-avoidance body turns
let bodyTurnHoldCount: number = 0;     // steps of current body-turn direction
let trackedTankId: number | null = null;
let trackedLostCount: number = 0;
let specialMode: boolean = false;
let specialModeStartStep: number = -100;
let specialModeCooldownUntil: number = 0;
let specialModeEntryHealth: number = 10;
let specialModeTargetPowerupId: number = -1;
let specialModeTargetX: number = 0;
let specialModeTargetY: number = 0;
let specialModeTargetMissedSteps: number = 0;
let slowMoActive: boolean = false;
let slowMoStartStep: number = -100;
let slowMoLastEntryStep: number = -100;

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SWEEP_HOLD = 12;
const MIN_BODY_HOLD = 8;
const TRACK_TIMEOUT = 20;
const ACCEL_THRESHOLD = 7;
const SWEEP_ANGLE = 8;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function normalizeAngle(a: number): number {
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}

/** Signed angular difference (shortest path) from→to. + = CW, - = CCW. */
function angleDiff(from: number, to: number): number {
  let d = normalizeAngle(to - from);
  if (d > 180) d -= 360;
  return d;
}

/** Bearing from (ax,ay) to (bx,by). 0=north, clockwise. */
function bearing(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = ay - by; // Y is inverted (0=top)
  const rad = Math.atan2(dx, dy);
  return normalizeAngle((rad * 180) / Math.PI);
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/** Length of a ray from (px,py) in `heading` degrees until it hits a map wall. */
function rayLength(px: number, py: number, heading: number, mapW: number, mapH: number): number {
  const rad = (heading * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (mapW - px) / dx);
  else if (dx < 0) t = Math.min(t, -px / dx);
  if (dy > 0) t = Math.min(t, (mapH - py) / dy);
  else if (dy < 0) t = Math.min(t, -py / dy);
  return t === Infinity ? 0 : t;
}

/** Average coverage score for a turret heading (sum of two edge-ray lengths). */
function coverageScore(px: number, py: number, turretHeading: number, mapW: number, mapH: number): number {
  return (
    rayLength(px, py, normalizeAngle(turretHeading - 5), mapW, mapH) +
    rayLength(px, py, normalizeAngle(turretHeading + 5), mapW, mapH)
  );
}

/**
 * Clamp a turret rotation so the resulting heading never points into a nearby wall.
 * "Nearby" is defined by the soft-zone distances wallSoftX/Y.
 * The hardest allowed heading is parallel to the wall (90° away from its approach direction).
 */
function safeTurretRotate(
  currentHeading: number,
  rotDeg: number,
  px: number, py: number,
  mapW: number, mapH: number,
  wallSoftX: number, wallSoftY: number
): RotateTurretCommand {
  const clamped = Math.max(-10, Math.min(10, rotDeg));
  let targetHeading = normalizeAngle(currentHeading + clamped);

  const wallConstraints = [
    { dist: py,        approachHeading: 0,   soft: wallSoftY },  // top
    { dist: mapH - py, approachHeading: 180, soft: wallSoftY },  // bottom
    { dist: px,        approachHeading: 270, soft: wallSoftX },  // left
    { dist: mapW - px, approachHeading: 90,  soft: wallSoftX },  // right
  ];

  for (const wc of wallConstraints) {
    if (wc.dist < wc.soft) {
      // Forbidden zone: within 90° of the wall's approach direction
      if (Math.abs(angleDiff(targetHeading, wc.approachHeading)) < 90) {
        const boundaryA = normalizeAngle(wc.approachHeading - 90);
        const boundaryB = normalizeAngle(wc.approachHeading + 90);
        const diffA = Math.abs(angleDiff(targetHeading, boundaryA));
        const diffB = Math.abs(angleDiff(targetHeading, boundaryB));
        targetHeading = diffA <= diffB ? boundaryA : boundaryB;
      }
    }
  }

  const safeRot = Math.max(-10, Math.min(10, angleDiff(currentHeading, targetHeading)));
  return new RotateTurretCommand(safeRot);
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
  allObservedTankScanEvents: Record<number, TankDetails[]>
): IStepCommand {
  const { Tank: tank, TankScans, PowerupScans } = state;
  const mapW = environment.MapSize.Width;
  const mapH = environment.MapSize.Height;
  const { X: px, Y: py } = tank.Location;

  // Per-axis wall distances derived from map size
  const wallDangerX = mapW * 0.08;   // hard zone: 8% of width
  const wallDangerY = mapH * 0.08;   // hard zone: 8% of height
  const wallSoftX   = mapW * 0.15;   // soft zone: start turning at 15% of width
  const wallSoftY   = mapH * 0.15;   // soft zone: start turning at 15% of height
  const outwardWallDist = Math.min(mapW, mapH) * 0.10;

  // ── 1. Emergency wall avoidance ─────────────────────────────────────────────
  //
  // Walls: top(Y=0), bottom(Y=mapH), left(X=0), right(X=mapW).
  // Heading toward wall is when the heading is within 90° of the wall's approach direction.
  //   top → 0°, bottom → 180°, left → 270°, right → 90°

  const walls = [
    { dist: py,          approachHeading: 0,   danger: wallDangerY, soft: wallSoftY },  // top
    { dist: mapH - py,   approachHeading: 180, danger: wallDangerY, soft: wallSoftY },  // bottom
    { dist: px,          approachHeading: 270, danger: wallDangerX, soft: wallSoftX },  // left
    { dist: mapW - px,   approachHeading: 90,  danger: wallDangerX, soft: wallSoftX },  // right
  ];

  let mostDangerousWall: typeof walls[0] | null = null;
  for (const wall of walls) {
    if (wall.dist < wall.danger && Math.abs(angleDiff(tank.Heading, wall.approachHeading)) < 90) {
      if (!mostDangerousWall || wall.dist < mostDangerousWall.dist) {
        mostDangerousWall = wall;
      }
    }
  }

  if (mostDangerousWall !== null) {
    // Pick a rotation that steers heading away — rotate to be perpendicular to wall approach
    // (i.e. the desired heading is approachHeading ± 90°, choose the closest)
    const wallApproach = mostDangerousWall.approachHeading;
    const optionA = normalizeAngle(wallApproach + 90);
    const optionB = normalizeAngle(wallApproach - 90);
    const diffA = Math.abs(angleDiff(tank.Heading, optionA));
    const diffB = Math.abs(angleDiff(tank.Heading, optionB));
    const desiredHeading = diffA <= diffB ? optionA : optionB;
    const delta = angleDiff(tank.Heading, desiredHeading);

    // Body turn anti-flap
    const newDirection = delta >= 0 ? 1 : -1;
    if (bodyTurnHoldCount >= MIN_BODY_HOLD) {
      if (newDirection !== bodyTurnDirection) {
        bodyTurnDirection = newDirection;
        bodyTurnHoldCount = 0;
      }
    }
    bodyTurnHoldCount++;

    const maxRot = 10 - 0.75 * Math.min(Math.abs(tank.Velocity), 8);
    const rotDeg = Math.sign(bodyTurnDirection) * Math.min(maxRot, Math.abs(delta));
    return new RotateCommand(rotDeg);
  }

  // ── 2. Fire ─────────────────────────────────────────────────────────────────

  if (tank.GunEnergy.Value >= tank.GunEnergy.Max) {
    // Find enemies inside the 10° turret cone (±5° of turret heading)
    const enemiesInCone = TankScans.filter(s => {
      if (!s.IsEnemy) return false;
      const b = bearing(px, py, s.Location.X, s.Location.Y);
      return Math.abs(angleDiff(tank.TurretHeading, b)) <= 5;
    });

    if (enemiesInCone.length > 0) {
      // Friendly-fire check: is any friendly closer on this bearing?
      const closestEnemy = enemiesInCone.reduce((a, b) =>
        dist(px, py, a.Location.X, a.Location.Y) < dist(px, py, b.Location.X, b.Location.Y) ? a : b
      );
      const enemyDist = dist(px, py, closestEnemy.Location.X, closestEnemy.Location.Y);

      const friendlyBlocking = TankScans.some(s => {
        if (s.IsEnemy) return false;
        const b = bearing(px, py, s.Location.X, s.Location.Y);
        if (Math.abs(angleDiff(tank.TurretHeading, b)) > 5) return false;
        return dist(px, py, s.Location.X, s.Location.Y) < enemyDist;
      });

      if (!friendlyBlocking) {
        return new FireGunCommand();
      }
    }
  }

  // ── 2.5. SPECIAL mode: powerup collection ─────────────────────────────────────

  // Entry check (only when outside cooldown, health low enough, and a qualifying powerup exists)
  if (!specialMode && state.Step >= specialModeCooldownUntil && tank.Health.Value <= 8) {
    const healingNear = PowerupScans.filter(p => {
      if (p.Type !== 'Healing') return false;
      const d = dist(px, py, p.Location.X, p.Location.Y);
      const bodyDelta = Math.abs(angleDiff(tank.Heading, bearing(px, py, p.Location.X, p.Location.Y)));
      return d < mapW * 0.7 && bodyDelta < 90;
    }).sort((a, b) =>
      dist(px, py, a.Location.X, a.Location.Y) - dist(px, py, b.Location.X, b.Location.Y)
    );
    const candidate = healingNear[0];
    if (candidate) {
      const myDist = dist(px, py, candidate.Location.X, candidate.Location.Y);
      const friendlyCloser = TankScans.some(s => {
        if (s.IsEnemy) return false;
        return dist(s.Location.X, s.Location.Y, candidate.Location.X, candidate.Location.Y) < myDist;
      });
      if (!friendlyCloser) {
        specialMode = true;
        specialModeStartStep = state.Step;
        specialModeEntryHealth = tank.Health.Value;
        specialModeTargetPowerupId = candidate.Id;
        specialModeTargetX = candidate.Location.X;
        specialModeTargetY = candidate.Location.Y;
        specialModeTargetMissedSteps = 0;
      }
    }
  }

  // Exit check (only after minimum 10 steps in SPECIAL mode)
  if (specialMode) {
    // Track how many consecutive steps the powerup is absent from the scan cone.
    // The scan cone is only 10°-wide and sweeping, so absence just means the turret
    // is pointing elsewhere — not that the powerup is gone. Only exit when absent
    // for 25+ consecutive steps (powerup was likely collected or despawned) or healed.
    const powerupCurrentlyVisible = PowerupScans.some(p => p.Id === specialModeTargetPowerupId);
    if (powerupCurrentlyVisible) {
      specialModeTargetMissedSteps = 0;
    } else {
      specialModeTargetMissedSteps++;
    }

    if (state.Step - specialModeStartStep >= 10) {
      const healed = tank.Health.Value > specialModeEntryHealth;
      if (specialModeTargetMissedSteps >= 25 || healed) {
        specialMode = false;
        specialModeCooldownUntil = state.Step + 8;
      }
    }
  }

  // Navigate straight to powerup in SPECIAL mode
  if (specialMode) {
    const b = bearing(px, py, specialModeTargetX, specialModeTargetY);
    const delta = angleDiff(tank.Heading, b);
    if (Math.abs(delta) > 3) {
      const maxRot = 10 - 0.75 * Math.min(Math.abs(tank.Velocity), 8);
      return new RotateCommand(Math.sign(delta) * Math.min(maxRot, Math.abs(delta)));
    }
    if (tank.Velocity < ACCEL_THRESHOLD) {
      return new AccelerateCommand();
    }
    // Already aligned at speed — fall through to turret sweep while on course
  }

  // ── 3. Maintain top speed ────────────────────────────────────────────────────

  // SLOWMO mode: 1% random chance each step for tanks with ID divisible by 3,
  // gated by a 40-step cooldown. Skips acceleration for 10 steps so the tank
  // briefly decelerates (friction) to confuse enemies.
  if (tank.Id % 3 === 0) {
    if (!slowMoActive && state.Step - slowMoLastEntryStep > 40 && Math.random() < 0.01) {
      slowMoActive = true;
      slowMoStartStep = state.Step;
      slowMoLastEntryStep = state.Step;
    }
    if (slowMoActive && state.Step - slowMoStartStep >= 40) {
      slowMoActive = false;
    }
  }

  if (!slowMoActive && tank.Velocity < ACCEL_THRESHOLD) {
    return new AccelerateCommand();
  }

  // ── 3.5. Soft wall zone: begin turning early for smooth perimeter loop ────────
  // Skipped in SPECIAL mode — powerup navigation controls body steering there.
  if (!specialMode) {
    let softWall: typeof walls[0] | null = null;
    for (const wall of walls) {
      if (wall.dist < wall.soft && Math.abs(angleDiff(tank.Heading, wall.approachHeading)) < 90) {
        if (!softWall || wall.dist < softWall.dist) {
          softWall = wall;
        }
      }
    }

    if (softWall !== null) {
      const wallApproach = softWall.approachHeading;
      const optionA = normalizeAngle(wallApproach + 90);
      const optionB = normalizeAngle(wallApproach - 90);
      const diffA = Math.abs(angleDiff(tank.Heading, optionA));
      const diffB = Math.abs(angleDiff(tank.Heading, optionB));
      const desiredHeading = diffA <= diffB ? optionA : optionB;
      const delta = angleDiff(tank.Heading, desiredHeading);

      const newDirection = delta >= 0 ? 1 : -1;
      if (bodyTurnHoldCount >= MIN_BODY_HOLD) {
        if (newDirection !== bodyTurnDirection) {
          bodyTurnDirection = newDirection;
          bodyTurnHoldCount = 0;
        }
      }
      bodyTurnHoldCount++;

      const maxRot = 10 - 0.75 * Math.min(Math.abs(tank.Velocity), 8);
      const rotDeg = Math.sign(bodyTurnDirection) * Math.min(maxRot, Math.abs(delta));
      return new RotateCommand(rotDeg);
    }
  }

  // ── 4. Turret: track target or seesaw sweep ──────────────────────────────────

  // Update tracking state from current scans
  const visibleEnemies = TankScans.filter(s => s.IsEnemy);
  if (visibleEnemies.length > 0) {
    // Prefer the previously tracked enemy; otherwise pick the closest
    const stillVisible = trackedTankId !== null && visibleEnemies.some(s => s.TankId === trackedTankId);
    if (!stillVisible) {
      const closest = visibleEnemies.reduce((a, b) =>
        dist(px, py, a.Location.X, a.Location.Y) < dist(px, py, b.Location.X, b.Location.Y) ? a : b
      );
      trackedTankId = closest.TankId;
    }
    trackedLostCount = 0;
  } else {
    trackedLostCount++;
    if (trackedLostCount > TRACK_TIMEOUT) {
      trackedTankId = null;
    }
  }

  // 4b. Track a known enemy with prediction
  if (trackedTankId !== null) {
    const history = allObservedTankScanEvents[trackedTankId];
    if (history && history.length >= 1) {
      const last = history[history.length - 1];
      if (!last) {
        // Fallback: just rotate toward last seen direction via sweep
      } else {
        let targetX = last.Location.X;
        let targetY = last.Location.Y;

        // Predict position if we have two recent scans
        if (history.length >= 2) {
          const prev = history[history.length - 2];
          if (prev && last.Step - prev.Step <= 8) {
            const dt = last.Step - prev.Step;
            const vx = (last.Location.X - prev.Location.X) / dt;
            const vy = (last.Location.Y - prev.Location.Y) / dt;
            const travelTime = dist(px, py, targetX, targetY) / 15;
            targetX += vx * travelTime;
            targetY += vy * travelTime;
          }
        }

        const b = bearing(px, py, targetX, targetY);
        const delta = angleDiff(tank.TurretHeading, b);
        const rotDeg = Math.max(-10, Math.min(10, delta));
        return safeTurretRotate(tank.TurretHeading, rotDeg, px, py, mapW, mapH, wallSoftX, wallSoftY);
      }
    }
  }

  // 4c. Seesaw sweep

  // Outward recovery: if turret points toward a close wall, steer back to center
  const closestWallDist = Math.min(py, mapH - py, px, mapW - px);
  if (closestWallDist < outwardWallDist) {
    // Determine which wall(s) are close and whether turret points at them
    const wallDirections = [
      { heading: 0,   wallDist: py },
      { heading: 180, wallDist: mapH - py },
      { heading: 270, wallDist: px },
      { heading: 90,  wallDist: mapW - px },
    ];
    const pointingAtWall = wallDirections.some(w =>
      w.wallDist < outwardWallDist && Math.abs(angleDiff(tank.TurretHeading, w.heading)) < 30
    );
    if (pointingAtWall) {
      const centerBearing = bearing(px, py, mapW / 2, mapH / 2);
      const delta = angleDiff(tank.TurretHeading, centerBearing);
      const rotDeg = Math.max(-10, Math.min(10, delta));
      return safeTurretRotate(tank.TurretHeading, rotDeg, px, py, mapW, mapH, wallSoftX, wallSoftY);
    }
  }

  // Normal seesaw
  sweepHoldCount++;
  if (sweepHoldCount >= MIN_SWEEP_HOLD) {
    // Check whether continuing would point outward; if so, reverse
    const nextHeading = normalizeAngle(tank.TurretHeading + SWEEP_ANGLE * sweepDirection);
    const currentScore = coverageScore(px, py, tank.TurretHeading, mapW, mapH);
    const nextScore = coverageScore(px, py, nextHeading, mapW, mapH);
    if (nextScore < currentScore * 0.5) {
      sweepDirection *= -1;
      sweepHoldCount = 0;
    }
  }

  return safeTurretRotate(tank.TurretHeading, SWEEP_ANGLE * sweepDirection, px, py, mapW, mapH, wallSoftX, wallSoftY);
}
