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

  // Example strategy
  if (state.Tank.GunEnergy.Value === state.Tank.GunEnergy.Max) {
    return new FireGunCommand();
  }
  else {
    return new RotateTurretCommand(2);
  }
}
