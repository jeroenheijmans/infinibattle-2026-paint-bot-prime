import {
  AccelerateCommand,
  ReverseCommand,
  BrakeCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { EnvironmentMessage, StatState, StepState, Vector } from './messages';



export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState
): IStepCommand {
  // Dummy strategy:
  return new RotateTurretCommand(10);
}
