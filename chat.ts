import { ChatCommand } from './commands';
import type { EnvironmentMessage, StepState } from './messages';

export function createBanter(
  environment: EnvironmentMessage,
  state: StepState,
): ChatCommand {
  // Dummy chat logic
  if (state.Tank.Health.Value <= 2) {
    return new ChatCommand("Paintbotzzz united till we die!")
  }
  return new ChatCommand("Paintbot Army rulez!!");
}
