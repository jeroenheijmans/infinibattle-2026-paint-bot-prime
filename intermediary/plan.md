# PaintBot Prime — Implementation Plan

## Architecture

Single `executeStrategyForStep` function that uses persistent state stored in module-level variables (since the module is loaded once per bot instance). The function returns exactly one `IStepCommand` per step.

---

## 1. Persistent State (Module-Level Variables)

- `sweepDirection: 1 | -1` — current turret sweep direction (+1 = clockwise, -1 = counter-clockwise)
- `sweepHoldSteps: number` — counter to prevent turret direction flapping (minimum steps before reversal)
- `moveDirection: 1 | -1` — current body movement direction (+1 = forward, -1 = backward for back-and-forth)
- `moveHoldSteps: number` — counter to prevent body rotation flapping
- `targetTankId: number | null` — ID of currently tracked enemy
- `targetLostSteps: number` — how many steps since we last scanned the tracked enemy
- `initialized: boolean` — whether we've done first-step setup
- `desiredHeading: number | null` — target heading for body rotation (for diagonal movement)

---

## 2. Command Priority Order (Highest to Lowest)

1. **Emergency wall avoidance** — if within ~40 units of any wall AND heading toward it, rotate away
2. **Fire** — if gun energy is at max AND we have a recent enemy scan, fire immediately
3. **Accelerate/Reverse** — maintain top speed at all times (accelerate if velocity < max, reverse if going wrong way for back-and-forth)
4. **Turret rotation** — sweep (see-saw) or track enemy
5. **Body rotation** — steer for back-and-forth diagonal patrol

Since we can only issue ONE step command, the priority determines which command wins. Turret rotation competes with everything else for the single command slot, so we must be strategic.

**Resolution:** Fire always wins when available. Otherwise, wall avoidance rotation wins. Otherwise, if we need to accelerate (velocity not at max), accelerate. Otherwise, rotate turret (sweep or track). Otherwise, rotate body for patrol. This means turret management happens in "free" steps when we're already at max speed and not near walls.

Actually, rethinking: the turret is critical for finding and tracking enemies. Let's use this refined priority:

1. **Emergency wall avoidance** → `rotate` away from wall
2. **Fire** → `fire-gun` (when gun full AND enemy recently scanned in turret arc)
3. **Turret track/sweep** → `rotate-turret` (when we need to aim or sweep)  
4. **Accelerate** → `accelerate` or `reverse` (when not at top speed)
5. **Body rotation** → `rotate` (for patrol pattern changes)

In practice: if velocity is near max, we have many steps free for turret rotation. If we need speed, we trade a turret step for acceleration.

---

## 3. Emergency Wall Avoidance

**Check ALL 4 walls every step:**
- Compute distance to each wall: left (X), right (MapWidth - X), top (Y), bottom (MapHeight - Y)
- If the closest wall is within **40 units** AND the tank's heading points toward that wall (within ±90°):
  - Rotate body toward the center of the arena
  - Calculate angle to arena center, find the shortest rotation to face that direction
  - This is **highest priority** — overrides everything except `fire-gun` when gun is ready

**Specific rotation:** Compute the angle from the tank to the arena center. Compute the difference from current heading. Rotate by clamped amount (max rotation depends on velocity: `10 - 0.75 * min(|velocity|, 8)`).

---

## 4. Turret Management

### 4a. Default: See-Saw Sweep
- Rotate turret by `sweepDirection * 10` degrees each step (maximum rotation)
- After **18 steps** in one direction (covering 180°), reverse direction
- `sweepHoldSteps` enforces minimum 18 steps before reversal → prevents flapping

### 4b. When Enemy Scanned: Lock & Track
- When `TankScans` contains an enemy, record `targetTankId` and reset `targetLostSteps = 0`
- Calculate angle from our tank to enemy's position
- **Predictive tracking:** If we have 2+ recent scans (within 8 steps) of the target, estimate its velocity vector and predict where it will be when a bullet would arrive
  - Bullet travel time = distance / 15 (bullet speed)
  - Predicted position = current position + velocity * travel time
  - Aim turret at predicted position instead of current position
- Calculate desired turret heading = angle to (predicted) enemy position
- Rotate turret toward desired heading (clamped to ±10°)
- If target not scanned for **15 steps**, set `targetTankId = null`, resume sweep

### 4c. Turret Recovery (Wall-Pointing Fix)
- Each step, calculate how much "battlefield" the scanner cone covers:
  - Cast the 10° scanner arc from tank position in turret heading direction
  - If the arc hits a wall within ~50 units (scanning very little ground), the turret is "wasted"
- If turret is pointing at a nearby wall, bias the sweep toward the arena center
  - Calculate angle to arena center from tank position
  - If center angle is outside current sweep direction, force sweep direction reversal (override hold counter)
  - This ensures the turret doesn't waste time scanning walls

---

## 5. Firing

- **Fire when:** `GunEnergy.Value >= GunEnergy.Max` AND we have a current target (enemy scanned in last ~10 steps) AND turret heading is approximately aligned with the target direction (within ~15°)
- **Predictive aim:** Use the predicted position from turret tracking (section 4b) to determine if turret is aligned
- **No friendly fire check:** Before firing, verify no friendly tank is in the line of fire (within ±10° of turret heading, closer than the enemy). Skip fire if a friendly is in the way.
- Fire takes priority over all other commands when conditions are met

---

## 6. Movement: Back-and-Forth Diagonal Patrol

- **Initial heading:** On first step, set a desired heading diagonally (~45° offset from current heading, or pick a random diagonal)
- **Accelerate to top speed** and maintain it. If `velocity < 7`, spend that step on `accelerate`. If velocity is negative and we want forward, `accelerate` to correct.
- **Back-and-forth:** When wall avoidance triggers, the tank naturally changes direction. For intentional back-and-forth:
  - Every ~60-80 steps (roughly when we'd cross the arena), rotate body by ~90-135° to zig in a different direction
  - Use `moveHoldSteps` to prevent direction flapping (minimum 30 steps before a voluntary direction change)
- **Direction changes:** When rotating body, compute the rotation needed and apply over multiple steps (max per step = `10 - 0.75 * |velocity|`, which is ~4° at top speed)

---

## 7. Power-Up Collection (Opportunistic)

- When a `PowerupScan` is detected AND it's a "Healing" type:
  - Calculate angle and distance to power-up
  - If the power-up is roughly in our path (within ±30° of current heading) AND distance < 200 units, AND health is not full:
    - Bias body rotation toward the power-up slightly
  - Do NOT chase power-ups that require large course corrections
  - Never override wall avoidance for power-ups

---

## 8. Anti-Flap Strategy

### Body Rotation Flapping Prevention
- `moveHoldSteps` counter starts at 30 when a direction change occurs
- Decrease by 1 each step
- New voluntary direction changes blocked until counter reaches 0
- Wall avoidance rotations DO override this (safety first)

### Turret Sweep Flapping Prevention
- `sweepHoldSteps` counter starts at 18 when sweep direction reverses
- Decrease by 1 each step
- Sweep direction reversal blocked until counter reaches 0
- Exception: turret recovery (wall-pointing fix) CAN override when turret is scanning a nearby wall
- Exception: enemy detection switches to track mode (not a sweep reversal)

---

## 9. Step-by-Step Execution Flow

```
Each step:
  1. Update targetLostSteps (increment if target set)
  2. Process TankScans → update target, check for enemies
  3. Check if target is stale (>15 steps) → clear target
  4. Estimate enemy velocity from allObservedTankScanEvents (if 2+ recent scans)
  5. Calculate predicted enemy position (if target exists)
  
  Determine command:
  6. If gun ready AND target valid AND turret aligned → FIRE
  7. If near wall AND heading toward it → ROTATE away
  8. If target exists → ROTATE-TURRET toward predicted position
  9. If no target → ROTATE-TURRET for sweep
  10. If speed < 7 → ACCELERATE
  11. If body needs rotation for patrol → ROTATE body
  12. Default → ACCELERATE (keep pushing speed up)
```

---

## 10. Key Utility Functions Needed

- `angleTo(from: Vector, to: Vector): number` — angle from one point to another (0° = north, clockwise)
- `angleDiff(a: number, b: number): number` — shortest signed angle difference (-180 to 180)
- `distanceTo(a: Vector, b: Vector): number` — Euclidean distance
- `estimateVelocity(scans: TankDetails[]): Vector | null` — estimate velocity from last 2 scans if within 8 steps
- `predictPosition(pos: Vector, vel: Vector, steps: number): Vector` — predict future position
- `isNearWall(pos: Vector, mapW: number, mapH: number, margin: number): { near: boolean, wallAngle: number }` — check proximity and direction to nearest wall
- `maxRotation(velocity: number): number` — compute max body rotation for current speed
