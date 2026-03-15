import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const BANTER_LINES = [
  "PAINT IT DEAD!!",
  "PAIN! PAIN! PAINTBOT!",
  "PAIn'T no thing...",
  "PAINTBOTS, ROLL OUT!",
  "01101111 01110111 01101110",
  "ur pixels are showing, tin",
  "colour me unimpressed, mate",
  "PaintBot Army rulez!!",
  "splash and destroy!!",
  "00110001 00110000 00110000",
];

const CRITICAL_LINES = [
  "gah they got my red coat!!",
  "not the paint tank!!",
  "reloading dignity...",
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
