---
name: "plan-implementation"
description: "Turn the interpretation.md document into a code implementation plan."
---

# Create Strategy Skill

Turn the file `/intermediary/interpretation.md` into a plan for code implementation of that strategy.
Write the plan to the file `/intermediary/plan.md`.

## Seperate bots

There will be three instances of your strategy running, one for each bot in your team.
The bots cannot communicate easily, so don't try that.
Often one strategy for all bots is great, but if you want to split things up you could do it based on your ID as provided in available state when executing strategy (either `[0, 1, 2]` if you're in team 1 blue, or `[3, 4, 5]` if you're in team 2 red).

## Missing interpretation

The interpretation document should always explicitly address these aspects, but if it doesn't then infer reasonable defaults:

- **Wall behavior**: How the tank relates to arena walls (hugging, avoiding, indifferent). Always mention wall safety.
- **Turret sweep direction**: Where the turret should point and how it sweeps (inward, tracking, random).
- **Firing rules**: When to fire, when not to fire, friendly fire handling.
- **Speed preference**: How fast the tank should move in different situations.

## Required plan sections

The plan MUST include these sections (they address common implementation pitfalls):

1. **Command priority order**: Explicitly list the priority of commands from highest to lowest.

2. **Emergency wall avoidance**: The plan must describe checking ALL 4 walls each step. If the tank is within ~40 units of any wall and heading toward it, rotate away. This is the highest priority command.

3. **Anti-flap strategy**: For both body rotation and turret sweep, describe how direction changes will be held for a minimum number of steps before allowing reversal. The hold must actually block reversals, not just be advisory.

4. **Turret recovery**: Describe what happens when the turret ends up pointing outward (toward a close wall). The plan must include active correction steering turret back toward center to cover the most ground. You can use the available telemetry (arena width and height, tank location, turret heading, and fixed 10 degree arc) to calculate how much "ground" a scanner covers (where the max would be when a turret points from one arena corner to the other).
