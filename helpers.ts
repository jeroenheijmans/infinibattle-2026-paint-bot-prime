import type { StatState, Vector } from "./messages";

export interface TankDetails {
  Step: number;
  TankId: number;
  Location: Vector;
  TurretHeading: number;
  Heading: number;
  Health: StatState;
  IsEnemy: boolean;
}