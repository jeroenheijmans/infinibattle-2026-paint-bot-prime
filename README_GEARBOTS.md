# GearBots — Complete Game Rules Reference

Top-down 2D tank battle. 2 teams × 3 tanks. Last team standing wins. No tank-to-tank collision.

Note: This game is extremely similar to "Robocode".

## Core Constants

| Parameter            | Value                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| Tick rate            | 25 FPS (40ms/step)                                                                      |
| Bot response timeout | 100ms (aim for <40ms)                                                                   |
| Map size             | Communicated at start (default 800×800)                                                 |
| Max game duration    | 2 minutes                                                                               |
| Tank spawn           | Random positions on a circle, random headings, random turret orientation, zero velocity |
| Tank max HP          | 10                                                                                      |
| Coordinate system    | 0° = north, positive rotation = clockwise                                               |

"Step" and "update" are synonymous throughout.

## Tank Model

- **Body** and **turret** rotate independently. Body rotation does NOT rotate the turret.
- Tank always moves in the direction it faces (no drifting).
- **Scanner** is on the turret; scans continuously in a 10°-wide cone centered on turret heading. No max range (reaches map edge). Detects tanks, bullets, powerups.

## Commands Per Step

- Exactly **one** `IStepCommand` per step (movement/rotation/fire). Only the **first** is used; subsequent ones are ignored.
- Unlimited `ChatCommand` and `LogCommand` per step.

### Step Commands

| Command               | Args    | Effect                                                           |
| --------------------- | ------- | ---------------------------------------------------------------- |
| `accelerate`          | —       | velocity += 1 (max 8)                                            |
| `reverse`             | —       | velocity -= 1 (min -8)                                           |
| `brake`               | —       | velocity moves toward 0 by 2                                     |
| `rotate <deg>`        | degrees | Rotate body. Positive = clockwise. Clamped to max (see formula). |
| `rotate-turret <deg>` | degrees | Rotate turret. ±10° max. Positive = clockwise. Clamped.          |
| `fire-gun`            | —       | Fire shell. Requires GunEnergy at max.                           |

**Body rotation limit formula:** `max_rotation = 10 - (0.75 × min(|velocity|, 8))`. At standstill: 10°/step. At max speed: 4°/step.

### Utility Commands

| Command      | Args    | Effect                                                       |
| ------------ | ------- | ------------------------------------------------------------ |
| `chat <msg>` | message | Visible to all. Max 50 chars. Rate-limited: 1 per 25 frames. |
| `log <msg>`  | message | Debug log visible in replay.                                 |

## Communication Protocol

Stdin (one JSON line per step) / stdout (text, one command per line).

### Startup Sequence

1. Bot writes `bot-start` to stdout
2. Bot reads `environment <JSON>` from stdin (once)

### Game Loop (each step)

1. Bot reads `state <JSON>` from stdin
2. Bot writes commands (one per line)
3. Bot writes `command-end`

Failure to send `command-end` within timeout = tank killed.

## Message Schemas

Types are defined in `messages.ts` — refer to that file for exact interfaces. Key fields below.

### Environment (once, prefix `environment `)

- `MapSize.Width`, `MapSize.Height` — battlefield dimensions
- `Tanks[]` — all tanks: `Id`, `TeamId`, `Name`, `TeamName`, `IsEnemy`, `IsYou`

### State (each step, prefix `state `)

- `Step` — current step number
- `GameResult` — `"Won"` | `"Lost"` | `"Tie"` (only present when game ends)
- `Tank` — your tank: `Location{X,Y}`, `Heading`, `TurretHeading`, `Velocity`, `Health{Value,Max}`, `GunEnergy{Value,Max}`, `ChatEnergy{Value,Max}`
- `TankScans[]` — scanned tanks: `TankId`, `Name`, `Location`, `Heading`, `TurretHeading`, `Health`, `IsEnemy`
- `DestroyedTankScans[]` — destroyed tanks in scan: `TankId`, `Name`, `Location`, `IsEnemy`
- `BulletScans[]` — scanned bullets: `BulletId`, `Location{X,Y}`, `Velocity{X,Y}`
- `PowerupScans[]` — scanned powerups: `Id`, `Location{X,Y}`, `Type` (e.g. `"Healing"`)
- `Hits[]` — damage taken this step: `TankId`, `Name`, `Damage`
- `ChatMessages[]` — messages: `TankId`, `TeamId`, `Name`, `Message`

## Physics

### Movement

- **Friction:** velocity × 0.98 each step; snaps to 0 when |velocity| < 0.5
- **Wall collision:** hitting map edge sets velocity to 0

### Combat

- **Gun energy:** regenerates 1/step, costs 15 (full) to fire
- **Bullet speed:** 15 units/step
- **Bullet damage:** 1 HP per hit
- **Tank collision radius:** 20 units
- **Bullet collision radius:** 5 units
- **Friendly fire is ON**

### Powerups

- First spawn at 4s, then every 10s
- **Healing:** restores 5 HP
- Despawn after 10s if uncollected
- Collision radius: 15 units
- Bullets do not interact with powerups
