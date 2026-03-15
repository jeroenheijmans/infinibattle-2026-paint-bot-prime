import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const BANTER_LINES = [
  "PAINT IT DEAD!!",
  "PAIN! PAIN! PAINTBOT!",
  "PAIN'T no thing to kill ya...",
  "PAINTBOTS, ROLL OUT!",
  "01101111 01110111 01101110",
  "Puttin' the AI in PAINT!",
  "Paint me unimpressed, mate",
];

const CRITICAL_LINES = [
  "Feeling the Pain(t)...",
  "PAAAAIIIIIINNNNNNNN...t",
  "Ugh! Need...Paintkillers...",
];

export function createBanter(
  environment: EnvironmentMessage,
  state: StepState,
): ChatCommand {
  if (state.Tank.Health.Value <= 3) {
    const idx = state.Step % CRITICAL_LINES.length;
    const line = CRITICAL_LINES[idx];
    return new ChatCommand(line ?? CRITICAL_LINES[0] ?? "ouch!!");
  }
  const idx = state.Step % BANTER_LINES.length;
  const line = BANTER_LINES[idx];
  return new ChatCommand(line ?? BANTER_LINES[0] ?? "PAINTBOT!");
}
