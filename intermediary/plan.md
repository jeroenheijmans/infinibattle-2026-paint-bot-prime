# PaintBot Prime — Implementation Plan

## Overview

Implement `executeStrategyForStep` in `/strategy.ts`. The function must return exactly **one** `IStepCommand` per call. Module-level mutable state tracks persistent data across steps.

---

## Module-level state

```typescript
let sweepDirection: number = 1;           // +1 clockwise, -1 counter-clockwise
let sweepHoldCount: number = 0;           // steps since last sweep reversal
let bodyTurnDirection: number = 1;        // +1 clockwise, -1 CCW (for wall avoidance hold)
let bodyTurnHoldCount: number = 0;        // steps of current body-turn direction
let trackedTankId: number | null = null;  // tank we are currently predicting/following
let trackedLostCount: number = 0;         // steps since tracked tank last visible
```

Constants:
```typescript
const WALL_DANGER = 40;          // units — emergency zone
const MIN_SWEEP_HOLD = 12;       // steps before sweep direction may reverse
const MIN_BODY_HOLD = 8;         // steps before body turn direction may reverse
const TRACK_TIMEOUT = 20;        // steps before giving up on a tracked target
const MAX_VELOCITY = 8;
const ACCEL_THRESHOLD = 7;       // accelerate if velocity < this
const SWEEP_ANGLE = 8;           // degrees per step for turret sweep
const OUTWARD_WALL_DIST = 80;    // if turret points toward a wall closer than this → recover
```

---

## 1. Command Priority Order (highest → lowest)

1. **Emergency wall avoidance** → `RotateCommand`
2. **Fire** → `FireGunCommand`
3. **Accelerate to top speed** → `AccelerateCommand`
4. **Turret: track target OR seesaw sweep** → `RotateTurretCommand`

---

## 2. Emergency Wall Avoidance (highest priority)

Check all 4 walls every step:

```
top wall:    distance = tank.Location.Y
bottom wall: distance = mapHeight - tank.Location.Y
left wall:   distance = tank.Location.X
right wall:  distance = mapWidth - tank.Location.X
```

For each wall, determine if the tank heading is "toward" it (within 90° of the perpendicular direction toward that wall):
- Top wall perpendicular (toward wall) = heading near 0° (north)
- Bottom wall perpendicular = heading near 180°
- Left wall perpendicular = heading near 270°
- Right wall perpendicular = heading near 90° ... wait, 0°=north, 90°=east, 270°=west

Actually (coord system: 0°=north, positive=clockwise):
- Top wall perpendicular direction = 0° (heading 0° means moving north = toward top wall)
- Bottom wall perpendicular = 180°
- Left wall perpendicular = 270°
- Right wall perpendicular = 90°

A heading is "toward wall" if the angular difference between the heading and the wall-approach direction is less than 90°.

If `distance < WALL_DANGER` AND heading is toward wall:
- Use body-turn anti-flap: only flip `bodyTurnDirection` if `bodyTurnHoldCount >= MIN_BODY_HOLD`
- Rotate body by `10 * bodyTurnDirection` (max rotation)
- Increment `bodyTurnHoldCount`, reset to 0 on direction flip
- **Return immediately** (this is the highest-priority command)

Choose the most dangerous wall (smallest distance below threshold) when multiple walls qualify.

---

## 3. Fire Command

Conditions to fire:
1. `tank.GunEnergy.Value >= tank.GunEnergy.Max`
2. At least one enemy `TankScanEvent` visible in current scans
3. The enemy's **angular offset from turret heading ≤ 5°** (inside the 10° cone)
4. **No friendly** tank is closer on that same bearing (friendly-fire prevention)

Friendly-fire check: for each friendly tank in `TankScans`, compute bearing from our tank to them. If that bearing is within 5° of turret heading AND their distance is less than the nearest enemy's distance → skip firing.

If all conditions pass → return `new FireGunCommand()`.

---

## 4. Accelerate to Top Speed

If `tank.Velocity < ACCEL_THRESHOLD` → return `new AccelerateCommand()`.

---

## 5. Turret Tracking / Sweep

This is the fallback command when wall avoidance, firing, and acceleration all don't apply.

### 5a. Target tracking

Maintain `trackedTankId`. Each step:
- Look for any enemy in `TankScans`.
- If found: update `trackedTankId = enemy.TankId`, reset `trackedLostCount = 0`.
- If not found: increment `trackedLostCount`; if `trackedLostCount > TRACK_TIMEOUT` set `trackedTankId = null`.

If `trackedTankId != null` and the enemy has history in `allObservedTankScanEvents`:
- Get the last scan of the tracked enemy.
- If the last 2 scans are ≤ 8 steps apart, estimate velocity: `vx = (x2-x1)/(step2-step1)`, `vy = (y2-y1)/(step2-step1)`.
- Compute bullet travel time: `travelTime = distance / 15`.
- Predict future position: `px = x + vx * travelTime`, `py = y + vy * travelTime`.
- Compute bearing to predicted position (using `atan2`, adjusted to 0°-north clockwise).
- Compute angular delta to turret heading (clamped to ±10°).
- Return `new RotateTurretCommand(delta)`.

### 5b. Seesaw sweep

If no tracked target:

**Outward recovery check first:**
- Compute which wall is closest. If turret heading is within 30° of pointing at a wall that is within `OUTWARD_WALL_DIST`:
  - Compute bearing from tank to arena center.
  - Rotate turret toward center (up to 10°).
  - Return `new RotateTurretCommand(...)` (skip sweep anti-flap for recovery).

**Normal seesaw:**
- Increment `sweepHoldCount`.
- If `sweepHoldCount >= MIN_SWEEP_HOLD`: check if we should reverse.
  - Compute turret coverage for current direction: use the turret heading + sweep angle to estimate scan area (see below). 
  - If continuing in the current direction would point outward (toward a wall within `OUTWARD_WALL_DIST`), reverse direction, reset `sweepHoldCount = 0`.
- Else: keep current direction regardless of boundary.
- Return `new RotateTurretCommand(SWEEP_ANGLE * sweepDirection)`.

---

## Coverage calculation (for sweep boundary decisions)

To evaluate whether a turret heading is "better" or "worse":
- Use the arena dimensions, tank position, turret heading, and the 10° arc to estimate how much ground the scanner covers.
- Simple approximation: trace a ray from the tank at heading ±5°. The "coverage" value = the ray length until it hits a wall. A larger total ray length = better coverage.
- Compare coverage of (current heading) vs (current heading + sweep delta). If the next heading would reduce coverage significantly AND the hold count is satisfied, prefer reversing.

---

## Angle utility functions (to implement in strategy.ts)

```typescript
// Normalizes angle to [0, 360)
function normalizeAngle(a: number): number

// Angular difference from a to b (shortest path, signed: + = CW, - = CCW)
function angleDiff(from: number, to: number): number

// Compute bearing from point A to point B (0=north, clockwise)
function bearing(ax: number, ay: number, bx: number, by: number): number

// Distance between two points
function dist(ax: number, ay: number, bx: number, by: number): number

// Ray length from (px, py) in direction `heading` until hitting map edge
function rayLength(px: number, py: number, heading: number, mapW: number, mapH: number): number
```

---

## Anti-flap enforcement

### Turret sweep anti-flap
```
sweepHoldCount increments every step.
Direction reversal is ONLY allowed when sweepHoldCount >= MIN_SWEEP_HOLD.
If sweepHoldCount < MIN_SWEEP_HOLD → always use current sweepDirection, no check.
On reversal: sweepDirection *= -1; sweepHoldCount = 0.
```

### Body turn anti-flap
```
bodyTurnHoldCount increments every step a body rotation is emitted.
Direction flip is ONLY allowed when bodyTurnHoldCount >= MIN_BODY_HOLD.
On flip: bodyTurnDirection *= -1; bodyTurnHoldCount = 0.
```

---

## Powerup steering (lower priority, woven in)

If a healing powerup is visible (`PowerupScans`), tank health ≤ 6, and the powerup is not near a wall (powerup.X > WALL_DANGER && powerup.X < mapW - WALL_DANGER && same for Y):
- Compute bearing to powerup.
- If bearing delta > 15° → this creates a desire to rotate body. This desire only executes if we are in step 4 (would return RotateTurretCommand) — in that case, instead return `RotateCommand` toward powerup.

---

## Verification

After implementation: `bun run check`
