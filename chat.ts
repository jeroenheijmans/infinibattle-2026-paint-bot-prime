import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const CRITICAL_LINES = [
  "PAIN! PAIN! PAINTBOT!",
  "01001000 01000101 01001100 01010000",
  "I'm leaking paint... send help",
  "PAINTBOTS NEVER DIE!!",
];

const TAUNT_LINES = [
  "PAINT IT DEAD!!",
  "Pain't nothing you can do",
  "PAINTBOTS, ROLL OUT!",
  "Bruv ur aim is absolute rubbish",
  "You call that a tank? lmao",
  "01010000 01000001 01001001 01001110",
  "Target acquired. Target painted.",
  "PaintBot Army rises, innit",
  "Rotating. Predicting. Painting.",
  "You're just a canvas, luv",
];

export function createBanter(
  environment: EnvironmentMessage,
  state: StepState,
): ChatCommand {
  const hp = state.Tank.Health.Value;
  const step = state.Step;

  if (hp <= 3) {
    const line = CRITICAL_LINES[step % CRITICAL_LINES.length];
    return new ChatCommand(line ?? "PAINTBOTS NEVER DIE!!");
  }

  const line = TAUNT_LINES[step % TAUNT_LINES.length];
  return new ChatCommand(line ?? "PAINT IT DEAD!!");
}
