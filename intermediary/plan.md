# PaintBot Prime — Implementation Plan

## Bot Identity

- Same strategy runs for all 3 tanks on the team (no ID-based splitting needed — all bots seesaw identically).
- Tank IDs: [0,1,2] or [3,4,5] depending on team assignment (available as `state.Tank.Id`).

---

## State Variables (module-level in strategy.ts)

```
seeSawMode: "accelerate" | "reverse"   // current see-saw direction
turretSweepDir: 1 | -1                 // +1 = clockwise, -1 = counter-clockwise
turretSweepHold: number                // steps remaining before allowed to flip turret direction
bodyRotateHold: number                 // steps of hold after a wall-avoidance rotation
```

Per-tank state is isolated because each bot runs as a separate process, so module-level variables are per-bot.

---

## Command Priority Order (highest → lowest)

1. **Emergency wall avoidance** — if within ~40 units of any wall AND heading toward it → `rotate` away
2. **Fire** — if gun is at max energy AND an enemy scan exists → `fire-gun`
3. **Turret: lock & predict** — if enemy scan exists → `rotate-turret` toward predicted position
4. **Turret: sweep** — default → `rotate-turret` in current sweep direction (see below)
5. **See-saw movement** — `accelerate` or `reverse` depending on current mode

Only ONE step command is emitted per step. Since commands 1, 2 cover body rotation and firing (which don't conflict with one another in the real game, but the protocol only accepts the first `IStepCommand`), the priority determines which single command is written.

**Resolution:** Since only ONE IStepCommand can be sent, the resolution rule is:
- If emergency wall avoidance triggered → emit `rotate`
- Else if gun full AND enemy visible → emit `fire-gun`
- Else if enemy visible AND turret needs to aim → emit `rotate-turret`
- Else if sweeping → emit `rotate-turret`
- Else → emit `accelerate` or `reverse` (see-saw)

In practice, movement is handled by the see-saw and acceleration/reverse, but the IStepCommand slot is occupied most of the time by turret rotation or firing. When using `rotate-turret` or `fire-gun`, the tank's velocity decays by friction (×0.98/step) but we do NOT brake intentionally — we accept that the tank may slow down when actively aiming. To regain speed, whenever we issue a turret command or fire, we ALSO track how many steps we haven't issued movement — if > 5 steps without a movement command AND no wall priority AND no firing, revert to see-saw movement.

**Revised priority (cleaner version):**

1. **Wall avoidance** (if near wall heading toward it): `rotate <deg>` — skip all below
2. **Fire** (if gun full AND enemy visible): `fire-gun` — skip all below
3. **Turret aim/sweep**: `rotate-turret <deg>` — covers both lock+predict and sweep — skip 4
4. **See-saw movement**: `accelerate` or `reverse`

Rationale: Movement via see-saw is the fallback. Firing beats turret rotation (since after firing, gun needs 15 steps to reload). Turret commands are evaluated every step — when aiming OR sweeping, the tank naturally slows; that's acceptable.

---

## Section 1: Emergency Wall Avoidance

Check all 4 walls each step:

```
const WALL_MARGIN = 40;
const { X, Y } = state.Tank.Location;
const { Width, Height } = environment.MapSize;
const heading = state.Tank.Heading;  // 0=North, clockwise
```

- **North wall** (Y < WALL_MARGIN): heading in range [315°, 360°) or [0°, 45°) → rotate clockwise (+10°)
- **South wall** (Y > Height - WALL_MARGIN): heading in range [135°, 225°) → rotate counter-clockwise (-10°)
- **East wall** (X > Width - WALL_MARGIN): heading in range [45°, 135°) → rotate counter-clockwise (-10°)
- **West wall** (X < WALL_MARGIN): heading in range [225°, 315°) → rotate clockwise (+10°)

Helper: `isHeadingToward(heading, wallDir)` using angular distance.

When wall avoidance fires, set `bodyRotateHold = 5` to prevent flip-flop. Decrement `bodyRotateHold` each step; only allow re-checking wall avoidance when `bodyRotateHold === 0`.

---

## Section 2: See-Saw Movement

- **Mode "accelerate"**: Emit `accelerate`.
  - Switch to "reverse" when `state.Tank.Velocity >= 7` (near max).
- **Mode "reverse"**: Emit `reverse`.
  - Switch to "accelerate" when `state.Tank.Velocity <= -7` (near max negative).
- Also switch mode when a wall collision is inferred (velocity is 0 AND previous velocity was nonzero going toward wall) — just flip mode.

This is the fallback step command (priority 4).

---

## Section 3: Turret Sweep

Default sweeping behavior (no enemy locked):

- Each step, rotate turret by `sweepSpeed = 8°` in `turretSweepDir`.
- Maintain `turretSweepHold` counter (minimum steps before direction reversal):
  - Sweep clockwise for a minimum of **8 steps** before reversing.
  - When reversing: flip `turretSweepDir`, reset `turretSweepHold = 8`.
  - To detect when to reverse: monitor absolute total rotation since last flip. After rotating ~60° (60/8 = ~8 steps), flip direction.
  - Track `turretSweepSteps: number` — increment each sweep step, reset on flip.
  - Reverse when `turretSweepSteps >= 8` (covers ~64° of arc at 8°/step).

**Turret recovery (outward-pointing turret):**
When no enemy is visible, check if the turret is pointing toward a nearby wall (i.e., in a direction with little coverage). Calculate approximate "scan ground" — the distance from tank to map edge in turret direction. If the turret is aimed within 30° of a wall that is less than 100 units away, rotate the turret back toward center by flipping sweep direction immediately (ignore hold counter in this case).

Implementation: compute the turret endpoint at max range, check if it exits the arena quickly. If projected hit distance is < 150 units, force flip regardless of hold.

Helper function: `projectedScanDistance(turretHeading, location, mapSize): number` — returns distance until the scan cone exits the map.

---

## Section 4: Enemy Targeting (Lock & Predict)

When `state.TankScans` contains at least one `IsEnemy === true` entry:

1. **Select target**: pick the enemy with lowest health (most likely to be eliminated); if tied, pick closest.
2. **Estimate velocity**: Look up `allObservedTankScanEvents[target.TankId]`. If last 2 scans are ≤ 8 steps apart:
   - `velX = (scan2.Location.X - scan1.Location.X) / (scan2.Step - scan1.Step)`
   - `velY = (scan2.Location.Y - scan1.Location.Y) / (scan2.Step - scan1.Step)`
3. **Lead shot**: 
   - `dist = distance(myLocation, targetLocation)`
   - `travelTime = dist / 15` (bullet speed = 15 units/step)
   - `predictedX = target.Location.X + velX * travelTime`
   - `predictedY = target.Location.Y + velY * travelTime`
4. **Desired turret angle**: `angleTo(myLocation, predicted)` → `desiredAngle`
5. **Delta**: `delta = normalizeAngle(desiredAngle - currentTurretHeading)` (in -180…+180 range)
6. Clamp delta to ±10° (max turret rotation per step).
7. Emit `rotate-turret delta`.

If no history / velocity unknown: just aim at current scan position (no prediction).

---

## Section 5: Fire Logic

Condition to fire:
- `state.Tank.GunEnergy.Value >= state.Tank.GunEnergy.Max` (gun fully charged)
- At least one enemy in `state.TankScans` with `IsEnemy === true`
- The target is within the scan cone (it IS in TankScans, so by definition inside the 10° arc)
- The angular difference between turret heading and the direction to target is ≤ 5° (roughly centered in cone)

If all conditions met → emit `fire-gun` (priority 2, beats turret rotation).

**No friendly fire check**: We trust that friendly tanks appear in `TankScans` with `IsEnemy === false`. Do not fire if the closest scanned tank is friendly and no enemy is also in the cone.

---

## Section 6: Power-Up Collection

When `state.PowerupScans` contains a `"Healing"` powerup:
- Compute angle from tank heading to the powerup.
- If the angular difference is ≤ 45° (powerup is roughly in front or behind based on current heading), no action needed — we'll pass naturally.
- Do NOT rotate to chase. Do NOT brake. Just keep current see-saw mode.
- If powerup is close (< 30 units) regardless of angle, still don't deviate — the tank will sweep over it due to movement.

(Power-up collection is passive — no special command issued for it.)

---

## Helper Functions to Implement

```typescript
// Normalize angle to [0, 360)
function normalizeAngle360(deg: number): number

// Normalize angle to (-180, 180]
function normalizeAngleDelta(deg: number): number

// Angle from point A to point B (degrees, 0=North, clockwise)
function angleTo(from: Vector, to: Vector): number

// Euclidean distance
function distance(a: Vector, b: Vector): number

// Is heading toward a wall? Returns boolean
function isHeadingTowardWall(heading: number, wallAngle: number, tolerance: number): boolean

// Projected distance in scan direction before hitting map edge
function projectedScanDistance(turretHeading: number, location: Vector, mapSize: Size): number
```

---

## Anti-Flap Rules (Summary)

| Component       | Hold Duration | Reset Trigger                |
|----------------|--------------|------------------------------|
| Body rotation  | 5 steps      | After any wall-avoidance rotate |
| Turret sweep   | 8 steps      | After each sweep reversal    |
| See-saw mode   | N/A (threshold-based, no flap risk — speed must reach ±7) | — |

---

## TypeScript File: strategy.ts

Structure:
1. Module-level mutable state (seeSawMode, turretSweepDir, turretSweepHold, bodyRotateHold, turretSweepSteps)
2. Helper functions (pure, no side effects)
3. `executeStrategyForStep(environment, state, allObservedTankScanEvents): IStepCommand`
   - Step A: Wall avoidance check → may return `RotateCommand`
   - Step B: Fire check → may return `FireGunCommand`
   - Step C: Enemy targeting → may return `RotateTurretCommand`
   - Step D: Turret sweep → returns `RotateTurretCommand`
   - Step E: See-saw fallback → returns `AccelerateCommand` or `ReverseCommand`
