# PaintBot Prime — Strategy Interpretation

## Overview

PaintBot Prime is an aggressive, high-speed see-saw tank that never stops moving. It uses constant back-and-forth motion (no body rotation), sweeping turret scans to hunt enemies, predictive aiming, and opportunistic power-up collection. Priority order: **Fire > Speed > Track & Predict**.

---

## Movement: See-Saw (No Rotation)

**Core principle:** The tank body NEVER rotates. Movement is exclusively achieved by alternating `accelerate` and `reverse` commands — a see-saw pattern of two modes.

- **Mode A (Accelerate):** Apply `accelerate` each step until reaching near-max speed (velocity ~7–8).
- **Mode B (Reverse):** Apply `reverse` each step until near max reverse speed (velocity ~ -7 to -8).
- Switch modes when reaching a speed threshold (near max in either direction) OR when approaching a wall.
- The tank moves along whatever the initial heading dictates — it does **not** steer to adjust direction.
- Wall collision resets velocity to 0; just resume the current mode after that.
- This creates constant erratic back-and-forth motion that's hard to predict and keeps speed high.

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

1. **FIRE** — If gun is loaded and enemy is in scanner cone, fire. Always.
2. **TOP SPEED** — Always be moving at or near maximum speed (accelerate or reverse). Never idle.
3. **SWEEP, FOLLOW & PREDICT** — Keep scanning; when enemy found, predict and track; lead shots.

---

## Banter Lines

Drawn banter from the image (to be implemented in chat):
- "PAINT IT DEAD!!"
- "PAIN! PAIN! PAINTBOT!"
- "PAIN'T NOTHING..."
- "PAINTBOTS, ROLL OUT!"
- (+ more to be created in the same flavor)
