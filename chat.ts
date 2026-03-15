import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const TAUNT_LINES = [
  "PAINT IT DEAD!!",
  "PAIN! PAIN! PAINTBOT!",
  "Pain't no thing...",
  "PaintBots, ROLL OUT!",
  "You shoot like a printer",
  "Get rekt, tin can!",
  "PaintBot Army rulez!!",
  "We lead, you bleed",
  "01001000 01001001",
  "Catch this brush stroke!",
];

const AGONY_LINES = [
  "I'm leaking paint...",
  "Just a scratch, bruv!",
  "Aaargh! Not the turret!",
  "Still standing, still mad",
  "11010 PAIN 11010",
];

export function createBanter(
  environment: EnvironmentMessage,
  state: StepState,
): ChatCommand {
  if (state.Tank.Health.Value <= 2) {
    const line = AGONY_LINES[state.Step % AGONY_LINES.length]!;
    return new ChatCommand(line);
  }
  const line = TAUNT_LINES[state.Step % TAUNT_LINES.length]!;
  return new ChatCommand(line);
}
