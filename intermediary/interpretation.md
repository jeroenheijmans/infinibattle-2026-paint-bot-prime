# PaintBot Prime — Strategy Interpretation

## Overview

PaintBot Prime is an aggressive, high-speed see-saw tank that never stops moving. It uses constant back-and-forth motion (no body rotation), sweeping turret scans to hunt enemies, predictive aiming, and opportunistic power-up collection. Priority order: **Fire > Speed > Track & Predict**.

---

## Movement: See-Saw With Alignment

**Core principle:** Tank moves via alternating `accelerate` and `reverse` — a see-saw of two modes. Body rotation IS allowed when needed to align heading or avoid walls, but is kept to a minimum.

- **Mode A (Accelerate):** Apply `accelerate` until velocity ≥ 90% of max (+7.2). Switch to Mode B at that point.
- **Mode B (Reverse):** Apply `reverse` until velocity ≤ −90% of max (−7.2). Switch to Mode A at that point.
- **Speed rule:** Always maintain speed at or above 90% of max (7.2 units/step) in the current see-saw direction. Speed maintenance is obligatory — never coast below this.
- **Bot spread by ID (tankId % 3):** Each bot has an assigned travel axis to prevent convergence on the same wall:
  - Bot local index 0 → East–West axis (heading 90° or 270°)
  - Bot local index 1 → North–South axis (heading 0° or 180°)
  - Bot local index 2 → Diagonal axis (heading 135° or 315°)
- **Soft heading correction:** When at near-max speed (and no higher-priority action), issue small `rotate` commands to align heading to the assigned axis or to be wall-parallel when near a wall.
- Wall collision resets velocity to 0; resume current mode immediately.

---

## Turret: See-Saw Sweep + Lock & Predict

**Default behavior (no enemy spotted):**
- Sweep the turret back and forth (see-saw): rotate turret clockwise to +some degrees, then counter-clockwise back — continuously scanning the environment.
- Sweep angle: approximately ±45° either side of forward-facing, cycling repeatedly.

**When enemy spotted (in `TankScans`):**
- **Lock & Predict:** Rotate the turret toward the predicted future position of the enemy.
- Prediction: estimate where the enemy tank will be when the bullet arrives, based on enemy heading and velocity (if known), or based on straight-line extrapolation.
- Lead the target: aim ahead of current position by `(distance / bulletSpeed)` steps × estimated movement delta.

---

## Firing

Fire when the gun is ready (`GunEnergy` at max = 15) AND there is an enemy within the scanner cone (i.e., a live enemy appears in `TankScans`).

**Fire in these cases (green checkmarks):**
- Enemy is in the scanner cone, roughly aligned with turret heading — fire immediately.
- Enemy is at medium range with good alignment — fire.
- Enemy is partially visible / uncertain — still fire if gun is ready (err toward shooting).

**Do NOT fire in these cases (red X):**
- No enemy in scanner cone at all — do not waste gun energy.
- Enemy is visible but clearly at a very poor angle (nearly perpendicular) — skip.

**Priority: FIRE > everything.** If gun is at max energy and an enemy is in range, fire trumps all other behavior.

---

## Power-Ups

**Collect when favorable (green checkmark):**
- A healing power-up appears in `PowerupScans` AND it is roughly in the direction the tank is already heading (within ~45° of current heading) — the tank should accelerate/move toward it naturally.
- Only deviate slightly to pick it up if it aligns with existing movement direction.

**Avoid when risky (red X):**
- Do NOT attempt to collect a power-up if it requires a sharp angle approach, crossing directly into enemy firing lines, or hard turning (remember: no body rotation allowed).
- If the power-up would require the tank to stop and turn, skip it.

---

## Priority Order

1. **WALL EMERGENCY** — Any wall closer than 40 units AND heading toward it: rotate to wall-parallel immediately.
2. **FIRE** — Gun loaded + enemy in scanner cone + turret within 5°: fire. Always.
3. **TOP SPEED (≥90%)** — If velocity is more than 10% below target (i.e., |v| < 7.2): accelerate or reverse. Never idle.
4. **SOFT HEADING CORRECTION** — At near-max speed, small rotate to align to assigned axis or wall-parallel.
5. **SWEEP, FOLLOW & PREDICT** — Keep scanning; when enemy found, predict and track; lead shots.

---

## Banter Lines

Drawn banter from the image (to be implemented in chat):
- "PAINT IT DEAD!!"
- "PAIN! PAIN! PAINTBOT!"
- "PAIN'T NOTHING..."
- "PAINTBOTS, ROLL OUT!"
- (+ more to be created in the same flavor)
