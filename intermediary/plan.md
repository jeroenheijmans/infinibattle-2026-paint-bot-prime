# Implementation Plan: PaintBot Prime

This plan outlines the implementation details for the "PaintBot Prime" strategy. The goal is to deploy three bots that patrol the edges of the map, scanning the center and firing upon detecting enemies, while avoiding walls and maintaining top speed.

## Bot Roles (Separation)
To achieve the "spread out" behavior, we will assign one wall to each bot based on their ID mapped to `0, 1, 2` (`botId = state.id % 3`):
- **Bot 0:** Patrols the **Top Wall** (y = 0).
- **Bot 1:** Patrols the **Left Wall** (x = 0).
- **Bot 2:** Patrols the **Bottom Wall** (y = state.arena.height).

## Required Plan Sections

### 1. Command Priority Order
1. **Emergency Wall Avoidance:** Prevent crashing.
2. **Firing:** Fire if an enemy is directly in the scanner beam (Fire! Fire! Fire!).
3. **Turret Recovery:** If the turret is pointing out of the map, steer it inwards to cover the most ground.
4. **Turret Lock & Predict:** If an enemy is in the scanner, align the turret to their predicted position.
5. **Turret Sweep (See-Saw):** If no enemy is visible, sweep the turret back and forth to find targets.
6. **Movement & Pathing:** Drive full speed along the assigned patrol wall, picking up nearby power-ups if convenient.

### 2. Emergency Wall Avoidance
The tank must check all 4 walls every step. If the tank is within ~40 units of any wall and its heading is pointed towards it:
- Override the movement command to rotate away from the wall.
- If it is patrolling an edge (e.g., top wall), it should stay close but bounce back if it gets too close to the corners (left/right walls) to maintain the "back and forth" patrol pattern.

### 3. Anti-Flap Strategy
To prevent stuttering (flapping) in both movement and turret rotation:
- **Body Rotation:** Implement a state variable `turnHoldTicks`. When a turn is initiated (especially for wall avoidance or changing patrol direction), the bot must maintain that turn direction for a minimum number of steps (e.g., 10-15 steps) before reversing.
- **Turret Sweep:** Implement a `sweepDirection` state (1 for clockwise, -1 for counter-clockwise). The turret must sweep continuously in one direction until it hits a sweep limit or needs turret recovery, and should hold a direction for at least 15 steps before reversing to avoid jitter.

### 4. Turret Recovery
If the turret ends up pointing outward (towards the nearest wall) where it covers very little ground:
- Calculate the "covered ground" (using the distance from the turret to the wall it is facing).
- If the covered ground is small, enforce a turret rotation that sweeps it back towards the center of the arena (the point of maximum coverage, like aiming across the diagonal).
- This ensures the "SEE SAW SWEEP" happens towards the center of the map rather than staring at the wall.

## Specific Behaviors

### Movement
- **Patrol Execution:** Each bot will try to approach its assigned wall safely. Once close (within ~80 units), it will align its heading parallel to the wall and move at `Top Speed`. When it nears the corner (within ~80 units of the perpendicular wall), it reverses direction (turns 180 degrees) using the anti-flap strategy to patrol back.
- **Power-Ups:** If a health power-up is nearby (within a small deviation from the wall, e.g., < 60 units), adjust the heading slightly to intersect it, provided it doesn't violate wall avoidance.

### Turret Logic & Firing Rules
- **Lock & Predict:** When an enemy is spotted in the `state.radar`, calculate their future position based on their `speed` and `heading`. Rotate the turret to align with this predicted position.
- **Firing:** 
  - Fire immediately if the enemy is near the center of the radar beam.
  - Do not fire if the enemy is just outside the beam or only barely clipped by the scanner edge.
  - Do not fire if a friendly bot is in the line of fire.
  - Fire if a power-up and an enemy are in line together.