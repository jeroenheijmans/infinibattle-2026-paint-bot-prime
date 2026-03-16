# PaintBot Prime — Strategy Interpretation

## Overview

PaintBot Prime is an aggressive, high-speed perimeter-running tank. It prioritises relentless fire over everything else, maintains absolute top speed to stay unpredictable, and uses a seesaw turret sweep augmented with predictive tracking when a target is acquired. Its banter shows paint-themed taunts and battle cries.

---

## AT THE START

All three red tanks spawn in a spread circle facing outward. They immediately accelerate to top speed and begin tracing a loose perimeter path around the arena — not hugging the walls, but staying a safe margin away. The path is wide, sweeping, and roughly follows the outer ring of the map, with gentle body rotations driven by wall proximity rather than a fixed schedule.

---

## MOVEMENT

- **Goal**: maintain maximum speed (velocity 8) at all times.
- **Path**: follow a loose perimeter loop — the tank moves forward, and wall-proximity reactions cause it to rotate, naturally creating a circular drift around the arena.
- **Wall safety margin**: stay at least 40 units from every wall. If any wall is within 40 units **and** the tank is heading toward it, rotate body away (slight inward/parallel bias). This is emergency wall avoidance and takes the highest command priority.
- **Body rotation for movement**: wall avoidance serves double duty as movement steering. In the absence of wall danger, continue straight ahead at speed; the next wall approach will bend the path again.
- **No reverse**: the tank should not slow down or reverse unless absolutely cornered (extreme emergency). Prefer rotating and accelerating through the corner.

---

## FIRING

Priority order for firing:

1. **Fire if gun is at max energy AND at least one enemy is inside the 10° turret cone AND no friendly tank is closer on that line** → `fire-gun` immediately.
2. **Don't fire** if a friendly tank is in the line of fire (friendly fire ON).
3. **Opportunistic shot at powerup area**: even an uncertain shot (enemy near powerup) is worth taking — the drawing shows a "? ✓" indicating borderline shots should lean toward firing.
4. Gun energy regenerates at 1/step (costs 15 to fire), so fire as soon as energy is full — never let it sit at max.

**Friendly-fire check**: before firing, scan visible tanks on the turret heading; if the closest tank on that bearing is friendly, skip firing.

---

## TURRET SWEEP (see-saw + predict & follow)

### Default: see-saw sweep
- The turret sweeps back and forth (seesaw / pendulum pattern).
- Sweep in steps of up to ±10° per command.
- Anti-flap rule: hold the current sweep direction for a minimum of **12 steps** before allowing a reversal. A reversal is only triggered when the turret would leave the "safe inward zone" (pointing toward a close wall is bad) OR after the minimum hold has elapsed.
- **Turret outward recovery**: if the turret is pointing toward a wall that is within 80 units, actively steer the turret back toward the arena centre (not just reverse the sweep) until it clears the outward zone.

### On target acquired: predict & follow
- When an enemy was recently scanned (within last 20 steps), estimate its velocity from the last two scan positions (if within 8 steps of each other).
- Predict the enemy's position N steps ahead (use bullet travel time: distance / 15 units-per-step).
- Rotate turret toward the predicted position rather than the last known position.
- Continue tracking until the enemy disappears from telemetry for more than 20 steps, then return to seesaw sweep.

---

## POWER UPS

- **Collect**: if a healing powerup is visible in the scan and the tank is below 7 HP, steer toward it.
- **Safe collection only**: shown in the drawing — do NOT chase a powerup if reaching it would drive the tank into a wall or corner (X case in the drawing). The powerup is not worth sacrificing wall safety or top-speed momentum.
- **Good case**: powerup on a naturally aligned path (V in drawing) → steer toward it.

---

## PRIORITY ORDER (from the drawing "PRIO" section)

1. **Emergency wall avoidance** — `RotateCommand` (check all 4 walls every step; highest priority, overrides everything).
2. **Fire!** — `FireGunCommand` (gun full + clear shot, no friendly blocking).
3. **Top speed** — `AccelerateCommand` (if velocity < 7).
4. **Sweep / follow + predict** — `RotateTurretCommand` (seesaw or tracked enemy).

---

## BANTER

From the drawing text bubbles:
- "PAINT IT DEAD !!"
- "PAIN! PAIN! PAINTBOT!"
- "PAIn'T no thing…"
- "PAINTBOTS, ROLL OUT!"

Style: aggressive paint-themed battle cries, occasionally absurd. British rap-battle energy.
