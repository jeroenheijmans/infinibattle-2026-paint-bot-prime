export interface EnvironmentMessage {
  MapSize: Size;
  Tanks: EnvironmentTank[];
}

export interface EnvironmentTank {
  Id: number;
  TeamId: number;
  Name: string;
  TeamName: string;
  IsEnemy: boolean;
  IsYou: boolean;
}

export interface StepState {
  Step: number;
  GameResult?: GameResult;
  Tank: TankState;
  Hits: IncomingHitEvent[];
  TankScans: TankScanEvent[];
  DestroyedTankScans: DestroyedTankScanEvent[];
  BulletScans: BulletScanEvent[];
  PowerupScans: PowerupScanEvent[];
  ChatMessages: ChatMessageEvent[];
}

export enum GameResult {
  Won = "Won",
  Lost = "Lost",
  Tie = "Tie",
}

export interface TankState {
  Id: number;
  Location: Vector;
  Velocity: number;
  Heading: number;
  TurretHeading: number;
  Health: StatState; // at 0 tank is destroyed
  GunEnergy: StatState; // max is needed to fire the gun, recharges 1 point per game step
  ChatEnergy: StatState;
}

export interface StatState {
  Value: number;
  Max: number;
}

export interface IncomingHitEvent {
  TankId: number;
  Name: string;
  Damage: number;
}

export interface TankScanEvent {
  TankId: number;
  Name: string;
  Location: Vector;
  TurretHeading: number;
  Heading: number;
  Health: StatState;
  IsEnemy: boolean;
}

export interface DestroyedTankScanEvent {
  TankId: number;
  Name: string;
  Location: Vector;
  IsEnemy: boolean;
}

export interface BulletScanEvent {
  BulletId: number;
  Location: Vector;
  Velocity: Vector;
}

export interface PowerupScanEvent {
  Id: number;
  Location: Vector;
  Type: string;
}

export interface ChatMessageEvent {
  TankId: number;
  Name: string;
  Message: string;
}

export interface Size {
  Width: number;
  Height: number;
}

export interface Vector {
  X: number;
  Y: number;
}
