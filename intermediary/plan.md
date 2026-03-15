# PaintBot Prime — Implementation Plan

## Bot Identity

- Same strategy runs for all 3 tanks. Each bot has an **assigned travel axis** based on `tankId % 3`:

| `tankId % 3` | Assigned heading | Axis |
|---|---|---|
| 0 | 90° (East) | East–West |
| 1 | 0° (North) | North–South |
| 2 | 135° (SE) | Diagonal |

Assigned heading is stored in module-level state and set on the first step from `tank.Id`.

---

## State Variables (module-level in strategy.ts)

```
seeSawMode: "accelerate" | "reverse"   // current see-saw direction
turretSweepDir: 1 | -1                 // +1 = clockwise, -1 = counter-clockwise
turretSweepHold: number                // steps remaining before allowed to flip turret direction
softRotHold: number                    // cooldown after soft heading correction (steps)
assignedHeading: number | null         // set once from tankId % 3
```

---

## Command Priority Order (highest → lowest)

1. **Emergency wall avoidance** — any wall within 40 units AND heading toward it (±50° of direct-into-wall): `rotate` to wall-parallel. This check **always runs every step** (no hold/cooldown — the `isTowardWall` condition is self-limiting once heading is parallel).
2. **Fire** — gun full + enemy in scan cone + turret within 5° of enemy: `fire-gun`.
3. **Speed maintenance (≥90% of max)** — `TARGET_SPEED = 7.2` (90% of 8). If `(seeSawMode=="accelerate" && velocity < 7.2)` OR `(seeSawMode=="reverse" && velocity > -7.2)`: emit `accelerate`/`reverse`. This is high-priority to keep the bot at near-max speed at all times.
4. **Soft heading correction** — at near-max speed only; when `softRotHold === 0`, emit small `rotate` to align heading. Set `softRotHold = 4` after each correction to prevent oscillation. `softRotHold` decrements unconditionally every step regardless of what command was issued.
5. **Turret lock & predict** — enemy in scan: `rotate-turret` toward predicted future position.
6. **Turret sweep** — default: `rotate-turret` in current sweep direction.

**See-saw mode flipping:** Flip `seeSawMode` when `|velocity| >= 7.5` in the current direction (i.e., flip to "reverse" when accelerate reaches +7.5, flip to "accelerate" when reverse reaches −7.5). No time-based force-flip needed — the speed gate ensures it.

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

- **Mode "accelerate"**: Emit `accelerate`. Flip to "reverse" when `velocity >= +7.5`.
- **Mode "reverse"**: Emit `reverse`. Flip to "accelerate" when `velocity <= -7.5`.
- **Speed maintenance**: If not at 90% of target speed (`|velocity| < 7.2`), movement is priority 3 (beats turret). Always maintain near-max speed.
- The tank will spend most steps either accelerating/reversing to rebuild speed, or briefly at near-max speed doing turret/correction operations.

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

## Section 4: Soft Heading Correction

At near-max speed (priority 4 — below fire, below speed maintenance), issue a small `rotate` to steer toward the assigned axis or to be wall-parallel:

- **Near N or S wall** (Y < 80 or Y > H−80): rotate to align with E–W (heading 90° or 270°, whichever is closer).
- **Near E or W wall** (X < 80 or X > W−80): rotate to align with N–S (heading 0° or 180°, whichever is closer).
- **Open field**: rotate to align with `assignedHeading` (or its opposite 180° away, whichever is closer to current heading).
- Only apply if angular error ≥ 5°; clamp rotation to ±10°.
- After any soft correction, set `softRotHold = 4` to prevent oscillation. `softRotHold` decrements every step unconditionally at the top of the function.

## Section 5: Enemy Targeting (Lock & Predict)

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
