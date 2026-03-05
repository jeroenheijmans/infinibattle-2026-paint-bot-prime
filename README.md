# PaintBot — GearBots Tank Battle Bot

**Runtime:** Bun (TypeScript). **Bot name:** PaintBot.

2 teams × 3 tanks per match. Communication via stdin (JSON state) / stdout (text commands) at ~25 FPS.

## Files

| File                 | Purpose                                  | Editable?                         |
| -------------------- | ---------------------------------------- | --------------------------------- |
| `index.ts`           | Bot logic                                | **Yes** — this is what we develop |
| `commands.ts`        | Command types (stdout)                   | **No** — never modify             |
| `messages.ts`        | Message types (stdin)                    | **No** — never modify             |
| `README_GEARBOTS.md` | Complete game rules & protocol reference | Reference only                    |

## Testing

Manual only — no automated tests. User must run the bot against the game runner to verify changes.
