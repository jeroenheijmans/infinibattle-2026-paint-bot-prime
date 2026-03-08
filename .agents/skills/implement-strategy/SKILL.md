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
