import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const MOCKERY = [
  "PAINT IT DEAD!!",
  "PAIN! PAIN! PAINTBOT!",
  "PAIN'T NOTHING...",
  "PAINTBOTS, ROLL OUT!",
  "Nothing but scrap metal!",
  "Basic bots doin' geometry.",
  "You can't escape the ends.",
  "01010000 01000001 01001001" // PAI
];

const AGONY = [
  "Aw nah, chassis busted!",
  "01100101 01110010 01110010",
  "Paint shedding! Backup!",
  "Fix me bruv!!"
];

export function createBanter(
  environment: EnvironmentMessage,
  state: StepState,
): ChatCommand {
  const hp = state.Tank.Health.Value;
  
  if (hp <= 3) {
    const list = AGONY;
    const msg = list[state.Step % list.length] || "Ouch!";
    return new ChatCommand(msg);
  } else {
    const list = MOCKERY;
    const msg = list[state.Step % list.length] || "Paintbot!";
    return new ChatCommand(msg);
  }
}
