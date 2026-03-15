# PaintBot Prime — Strategy Interpretation

## Overview

The drawing describes a comprehensive tank strategy called "PaintBot Prime" with six distinct panels covering startup behavior, firing doctrine, movement patterns, power-up collection, turret scanning, and priorities.

---

## 1. AT THE START

**Panel description:** A single red tank inside the arena (four walls visible). Curved gray arrows show the tank performing sweeping S-curve movements from its spawn position. The tank moves in wide arcs rather than straight lines, covering ground while being hard to hit.

**Interpreted behavior:**
- On game start, immediately begin moving at top speed
- Use sweeping/curving movement to make the tank hard to target
- Don't sit still at spawn — get moving right away

---

## 2. FIRING

**Panel description:** Three rows of examples, each showing a wrong (X) and right (✓) way to fire:
- **Row 1:** X = shooting directly at where the enemy currently is. ✓ = shooting ahead of the enemy, leading the target so the bullet arrives where the enemy *will be*.
- **Row 2:** X = shooting at a moving enemy's current position (miss). ✓ = leading the shot to intercept the moving enemy's predicted future position.
- **Row 3:** ?✓ = conditional scenario — shoot even near explosions/powerups. ✓ = always fire when gun is ready, even in messy situations.

**Interpreted behavior:**
- **Always lead targets** — predict where the enemy will be when the bullet arrives, don't shoot at current position
- Use enemy velocity/heading to calculate intercept point
- **Fire as soon as gun is ready** — never hold fire, firing is the top priority
- Predictive aiming based on distance and bullet travel time

---

## 3. BANTER

**Chat lines shown in speech bubbles:**
- "PAINT IT DEAD!!"
- "PAIN! PAIN! PAINTBOT!"
- "PAIN'T NO THING..."
- "PAINTBOTS, ROLL OUT!"

---

## 4. MOVEMENT

**Panel description:** "BACK AND FORTH" label. Tank shown moving in diagonal patterns across the arena — alternating directions when approaching walls. Red dotted lines show bullet trajectories. The tank zigzags across the field in a patrol pattern.

**Interpreted behavior:**
- Move in a **back-and-forth patrol pattern** — don't circle, zigzag
- When approaching a wall, reverse direction (rotate and go back)
- Keep moving at **top speed** at all times
- Diagonal movement preferred — harder to hit than straight-line movement
- Maintain mobility; never stop

---

## 5. POWER UPS

**Panel description:** Two scenarios:
- ✓ (top): Tank approaches healing power-up (green plus) via a calculated path — safe approach
- X (bottom): Tank making a dangerous/reckless beeline for a power-up near the wall corner with enemies nearby

**Interpreted behavior:**
- **Collect power-ups when they're in your path** or nearby and safe
- **Don't abandon strategy to chase power-ups** — don't make reckless diversions
- If a power-up is nearby and reachable without major course change, go for it
- Don't go into corners/dangerous areas just for a power-up

---

## 6. TURRET SWEEP

**Panel description:** Two turret behaviors shown:
- **"SEE SAW SWEEP"**: Turret sweeps back and forth in an oscillating arc (azure scan lines shown). Continuous sweeping to scan for enemies.
- **"LOCK & PREDICT"**: Once an enemy is detected, stop sweeping and lock turret toward the enemy. Then predict where they're going and track them.

**Interpreted behavior:**
- **Default mode: See-saw sweep** — turret oscillates back and forth to scan the battlefield
- **On enemy detection: Lock and track** — aim turret at detected enemy
- Use prediction to keep turret aimed at where the enemy will be
- Resume sweeping if enemy is lost (no scans for several frames)

---

## 7. PRIORITIES (PRIO)

**Panel description:** Three priority items listed in order:
1. **"FIRE! FIRE! FIRE! FIRE!"** — Maximum priority on firing
2. **"TOP SPEED"** (with wavy underline for emphasis) — Always maintain maximum velocity
3. **"SWEEP FOLLOW + PREDICT"** — Turret management: sweep, follow targets, predict movement

**Interpreted behavior:**
- **Priority 1: FIRE** — If gun is loaded and an enemy is in sights, fire immediately. This overrides everything.
- **Priority 2: SPEED** — Always accelerate to max speed. Never voluntarily slow down.
- **Priority 3: TURRET** — Sweep to find enemies, follow them when found, predict their movement for aiming.
- Movement/steering is implicit — it happens but is lower priority than the above three.
