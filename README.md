# PaintBot — Gearbots Tank Battle Bot

Repo to create a Gearbots (Robowars clone) tank bot with a strategy derived from a crude drawing given by the user.

**Runtime:** Bun (TypeScript). **Bot name:** PaintBot.

2 teams × 3 tanks per match. Communication via stdin (JSON state) / stdout (text commands) at ~25 FPS.

## Files

| File / Folder         | Purpose                                  | Editable?                                      |
| --------------------- | ---------------------------------------- | ---------------------------------------------- |
| `/intermediar/*`      | Intermediary files for the process       | **Yes** - SKILLS leave intermediary files here |
| `/index.ts`           | Bot logic                                | **Yes** — this is what we develop              |
| `/commands.ts`        | Command types (stdout)                   | **No** — never modify                          |
| `/messages.ts`        | Message types (stdin)                    | **No** — never modify                          |
| `/README_GEARBOTS.md` | Complete game rules & protocol reference | Reference only                                 |

## Testing

Manual only — no automated tests. User must run the bot against the game runner to verify changes.

## Development workflow

The intention is to create TypeScript code for a tank bot in a simulation game called Gearbots.
Input is a drawing by the user (and nothing else), plus you have many additional resources.

The base plan to create a bot with these steps (there are skills for each):

1. **Interpret** (interpret-drawing): Interpret the drawing and create strategy document.
2. **Plan** (plan-implementation): Turn strategy document into implementation plan.
3. **Implement** (implement-strategy): Turn implementation plan into actual strategy code.
4. **Iterate** (iterate-implementation): Run automated checks and iterate on code if needed.
5. **Publish** (publish-gearbot): Package the result in a zip file.
