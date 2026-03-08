---
name: "implement-strategy"
description: "Takes the implementation plan and turns it into a strategy implementation."
---

# Implement Strategy Skill

Take the file `/intermediary/plan.md` as input: it contains the plan for implementing the strategy desired by the user.
You are only allowed to update `/strategy.ts`, implementing the `executeStrategyForStep` function body.

Read `/README_GEARBOTS.md` for a description of the game and its physics.
Take inspiration from "Robowars" but **be very careful: physics and game loop logic in Gearbots is different** in the details.

Some general tips while implementing:

- The `executeStrategyForStep` function can return only 1 command! Write code in a way that less important commands don't get hidden so far down deep that they are never executed.
- When "sweeping" with the turret to scan for new enemies, prevent "flapping" and stay consistent for some time in the direction you rotate in.
- When "turning" the tank for direction, prevent "flapping" by staying consistent for some time in your direction.
- Beware of friendly fire, you can hurt tanks in your team if you scan them
- The longer it has been since you last fired your gun, the more important it becomes to fire your gun (unless a friendly tank is in direct line of fire)
- Liberally use the "Gun Energy", don't let it sit at max level too long
- You can add state to `/strategy.ts` outside the function to track things over time (e.g. how long it's been since you fired)
- Don't accelerate if you are already at max speed, and if you want to cover some ground ensure your speed is high, near the max
- High priority: try to stay at least 35 units away from the walls, as it's easy to get "stuck" on the walls.
- Prefer not to sweep your scanner outwards if you're near a wall. Put differently: you can calculate the surface area your sweep (and intended sweep after a `RotateTurret` command) and usually consider a larger covered area preferable.
- When "tuning" for a strategy from the user, always check if your `Rotate` command is in the most efficient direction (clockwise or counterclockwise).

## Critical implementation patterns (learned from past runs)

These are common bugs that have occurred before. You MUST address each one:

### 1. Emergency wall avoidance must check ALL walls and be highest priority

Don't just track distance to the "current" wall the strategy cares about. Check the distance to **all 4 walls** every step. If the tank is within the safety margin (~40 units) of ANY wall AND heading toward it, emit a `RotateCommand` to steer parallel/away — this must be the **highest priority command**, above even firing. Tanks that drift at a slight angle toward walls WILL get stuck without this.

```
For each wall:
  if distance < DANGER_THRESHOLD:
    if heading is toward this wall (not parallel/away):
      rotate toward nearest parallel direction with slight inward bias
```

### 2. Turret sweep anti-flap must be actually enforced

Don't just track a `sweepStepCount` — actually use it to **block** direction reversals until the minimum hold time has elapsed. A common bug: boundary checks reverse the sweep direction every step, overriding the anti-flap counter. Structure it as:

```
if sweepStepCount >= MIN_HOLD (e.g. 10):
  check boundaries and maybe reverse
else:
  keep current direction no matter what
```

### 3. Turret outward recovery

If the turret has drifted too far outward (pointing toward a nearby wall instead of inward), don't try to "sweep back" — actively steer it toward the center. Otherwise the sweep logic may oscillate trying to reverse from an already-bad position.

### 4. Verify all code paths are reachable

Since only 1 command can be returned, ensure that the decision tree doesn't make speed maintenance (acceleration) or other logic for specific commands unreachable.

## Verification

To verify if the code you generated is correct, run both:

```
bun x tsc --noEmit
bun test
```

The test suite in `/strategy.test.ts` runs smoke tests over `executeStrategyForStep` with a range of inputs — all tests should pass and serve as a quick sanity check that the function returns a command in every scenario.
