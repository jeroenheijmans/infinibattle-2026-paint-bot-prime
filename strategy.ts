import {
  AccelerateCommand,
  ReverseCommand,
  BrakeCommand,
  RotateCommand,
  RotateTurretCommand,
  FireGunCommand,
  type IStepCommand,
} from './commands';
import type { TankDetails } from './helpers';
import type { EnvironmentMessage, StatState, StepState, Vector } from './messages';



export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState,
  // From TankId to TankDetails object
  allObservedTankScanEvents: Record<number, TankDetails[]>
): IStepCommand {
  // Dummy strategy:
  return new RotateTurretCommand(10);
}
