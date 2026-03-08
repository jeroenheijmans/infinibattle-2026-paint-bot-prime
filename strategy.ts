import {
  AccelerateCommand,
  ReverseCommand,
  BrakeCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { EnvironmentMessage, StepState } from './messages';

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
): IStepCommand {

  // Dummy strategy, just try to fire the gun each step:
  return new FireGunCommand();
}
