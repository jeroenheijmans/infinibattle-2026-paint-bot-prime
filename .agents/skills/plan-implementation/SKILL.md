---
name: "plan-implementation"
description: "Turn the interpretation.md document into a code implementation plan."
---

# Create Strategy Skill

Turn the file `/intermediary/interpretation.md` into a plan for code implementation of that strategy.
Write the plan to the file `/intermediary/plan.md`.

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

4. **Turret recovery**: Describe what happens when the turret ends up pointing outward (toward a close wall). The plan must include active correction steering turret back toward center to cover the most ground.
