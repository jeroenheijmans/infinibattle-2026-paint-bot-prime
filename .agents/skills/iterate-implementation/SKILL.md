---
name: "iterate-implementation"
description: "Iterate on the implemented strategy code by reviewing and improving it"
---

# Iterate Implementation SKILL

Evaluate the implemented `/strategy.ts` file.
If you spot obvious problems, try to fix them.
Iterate this check max 2 times or stop if you made no more changes.
After that the user will verify the solution manually.

## Review checklist

Check each of these specifically — they are common sources of bugs:

1. **Dead code from command priority**: Trace through every possible code path. Since only ONE command can be returned per step, verify that acceleration / speed maintenance is actually reachable and not blocked behind turret rotation code that always returns first.

2. **Wall avoidance covers all 4 walls**: The bot must check distance to ALL walls each step, not just the wall it's "following". A tank drifting at a slight angle will hit a wall it isn't tracking. Emergency rotation must be the highest-priority command.

3. **Anti-flap actually enforced**: If there's a sweep step counter or turn hold counter, verify it actually *blocks* direction changes during the hold period. A common bug is updating the counter but still allowing boundary checks to override it.

4. **Turret outward recovery**: If the turret can end up pointing toward a wall (outward), verify there's active correction steering it back toward center — not just a sweep reversal that oscillates.

## Verification

If you make any code changes you can verify them with:

```
bun run check
```
