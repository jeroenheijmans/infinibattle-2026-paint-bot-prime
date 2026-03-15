import { describe, test, expect } from 'bun:test';
import { executeStrategyForStep } from './strategy';
import type { EnvironmentMessage, StepState, TankState } from './messages';
import type { TankDetails } from './helpers';

const VALID_STEP_COMMAND = /^(accelerate|reverse|brake|fire-gun|rotate-turret -?[\d.]+|rotate -?[\d.]+)$/;

function expectValidCommand(result: ReturnType<typeof executeStrategyForStep>): void {
  expect(result).not.toBeNull();
  expect(result.toCommandString()).toMatch(VALID_STEP_COMMAND);
}

function makeEnv(overrides: Partial<EnvironmentMessage> = {}): EnvironmentMessage {
  return {
    MapSize: { Width: 800, Height: 800 },
    Tanks: [
      { Id: 0, TeamId: 0, Name: 'PaintBot', TeamName: 'Red', IsEnemy: false, IsYou: true },
      { Id: 1, TeamId: 0, Name: 'Ally',     TeamName: 'Red', IsEnemy: false, IsYou: false },
      { Id: 2, TeamId: 1, Name: 'Enemy1',   TeamName: 'Blue', IsEnemy: true,  IsYou: false },
      { Id: 3, TeamId: 1, Name: 'Enemy2',   TeamName: 'Blue', IsEnemy: true,  IsYou: false },
    ],
    ...overrides,
  };
}

const stat = (value: number, max: number) => ({ Value: value, Max: max });

function makeState(overrides: Omit<Partial<StepState>, 'Tank'> & { Tank?: Partial<TankState> } = {}): StepState {
  const { Tank: tankOverride, ...stateOverrides } = overrides;
  return {
    Step: 1,
    Tank: {
      Id: 0,
      Location: { X: 400, Y: 400 },
      Velocity: 0,
      Heading: 90,
      TurretHeading: 90,
      Health: stat(10, 10),
      GunEnergy: stat(15, 15),
      ChatEnergy: stat(25, 25),
      ...tankOverride,
    },
    Hits: [],
    TankScans: [],
    DestroyedTankScans: [],
    BulletScans: [],
    PowerupScans: [],
    ChatMessages: [],
    ...stateOverrides,
  };
}

const env = makeEnv();
const tankHistory: Record<number, TankDetails[]> = {
  0: [
    { Step: 0, TankId: 0, Location: { X: 350, Y: 400 }, Heading: 90, TurretHeading: 90, Health: { Value: 10, Max: 10 }, IsEnemy: false },
    { Step: 1, TankId: 0, Location: { X: 400, Y: 400 }, Heading: 90, TurretHeading: 90, Health: { Value: 10, Max: 10 }, IsEnemy: false },
  ],
};

describe('executeStrategyForStep smoke tests', () => {

  test('center of map, no scans', () => {
    expectValidCommand(executeStrategyForStep(env, makeState(), tankHistory));
  });

  test('gun ready, enemy in line of fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { TurretHeading: 0 },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 400, Y: 200 }, Heading: 180, TurretHeading: 0, Health: stat(5, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('gun ready, friendly blocking line of fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { TurretHeading: 0 },
      TankScans: [
        { TankId: 1, Name: 'Ally', Location: { X: 400, Y: 200 }, Heading: 180, TurretHeading: 0, Health: stat(10, 10), IsEnemy: false },
      ],
    }), tankHistory));
  });

  test('near top wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 20 }, Heading: 350 },
    }), tankHistory));
  });

  test('near bottom wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 780 }, Heading: 180 },
    }), tankHistory));
  });

  test('near left wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 20, Y: 400 }, Heading: 270 },
    }), tankHistory));
  });

  test('near right wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 780, Y: 400 }, Heading: 90 },
    }), tankHistory));
  });

  test('top-left corner', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 50, Y: 50 }, Heading: 315 },
    }), tankHistory));
  });

  test('turret pointing outward (away from center)', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 100, Y: 400 }, TurretHeading: 270 },
    }), tankHistory));
  });

  test('at max speed, gun not ready', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Velocity: 8, GunEnergy: stat(5, 15) },
    }), tankHistory));
  });

  test('multiple enemies visible', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 300, Y: 300 }, Heading: 90,  TurretHeading: 0, Health: stat(8, 10), IsEnemy: true },
        { TankId: 3, Name: 'Enemy2', Location: { X: 500, Y: 300 }, Heading: 270, TurretHeading: 0, Health: stat(6, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('nearby healing powerup, low health', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(3, 10) },
      PowerupScans: [{ Id: 1, Location: { X: 450, Y: 400 }, Type: 'Healing' }],
    }), tankHistory));
  });

  test('taking damage', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(7, 10) },
      Hits: [{ TankId: 2, Name: 'Enemy1', Damage: 1 }],
    }), tankHistory));
  });

  test('late step, gun fully charged, no recent fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Step: 500,
    }), tankHistory));
  });

  test('gun fully depleted', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { GunEnergy: stat(0, 15) },
    }), tankHistory));
  });

  test('health at 1 (critical), enemy nearby', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(1, 10), Location: { X: 400, Y: 400 } },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 420, Y: 400 }, Heading: 180, TurretHeading: 0, Health: stat(10, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('moving at max reverse speed', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Velocity: -4, Heading: 45 },
    }), tankHistory));
  });

  test('turret pointing exactly at enemy', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { TurretHeading: 90, Location: { X: 400, Y: 400 }, GunEnergy: stat(15, 15) },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 600, Y: 400 }, Heading: 0, TurretHeading: 0, Health: stat(10, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('enemy destroyed scan reported', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      DestroyedTankScans: [
        { TankId: 3, Name: 'Enemy2', Location: { X: 300, Y: 500 }, IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('bullet incoming from the right', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 400 } },
      BulletScans: [
        { BulletId: 1, Location: { X: 600, Y: 400 }, Velocity: { X: -10, Y: 0 } },
      ],
    }), tankHistory));
  });

  test('two bullets converging on position', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 400 } },
      BulletScans: [
        { BulletId: 1, Location: { X: 600, Y: 400 }, Velocity: { X: -10, Y: 0 } },
        { BulletId: 2, Location: { X: 400, Y: 600 }, Velocity: { X: 0,   Y: -10 } },
      ],
    }), tankHistory));
  });

  test('healing powerup available, health full', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(10, 10), Location: { X: 400, Y: 400 } },
      PowerupScans: [{ Id: 2, Location: { X: 410, Y: 400 }, Type: 'Healing' }],
    }), tankHistory));
  });

  test('multiple powerups visible', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(4, 10) },
      PowerupScans: [
        { Id: 3, Location: { X: 200, Y: 200 }, Type: 'Healing' },
        { Id: 4, Location: { X: 600, Y: 600 }, Type: 'GunEnergy' },
      ],
    }), tankHistory));
  });

  test('exact corner bottom-right', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 790, Y: 790 }, Heading: 135 },
    }), tankHistory));
  });

  test('heading exactly south (180), enemy directly north', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 400 }, Heading: 180, TurretHeading: 0 },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 400, Y: 200 }, Heading: 180, TurretHeading: 180, Health: stat(3, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('ally scan only, no enemies visible', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      TankScans: [
        { TankId: 1, Name: 'Ally', Location: { X: 450, Y: 450 }, Heading: 90, TurretHeading: 0, Health: stat(10, 10), IsEnemy: false },
      ],
    }), tankHistory));
  });

  test('very early step (step 0)', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({ Step: 0 }), tankHistory));
  });

  test('low health, no powerups, surrounded by two enemies', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(2, 10), Location: { X: 400, Y: 400 } },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 350, Y: 400 }, Heading: 90,  TurretHeading: 90,  Health: stat(10, 10), IsEnemy: true },
        { TankId: 3, Name: 'Enemy2', Location: { X: 450, Y: 400 }, Heading: 270, TurretHeading: 270, Health: stat(10, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('against left wall moving leftward, enemy behind', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 15, Y: 400 }, Heading: 270, Velocity: 5 },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 200, Y: 400 }, Heading: 90, TurretHeading: 270, Health: stat(8, 10), IsEnemy: true },
      ],
    }), tankHistory));
  });

  test('chat energy full', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { ChatEnergy: stat(25, 25) },
    }), tankHistory));
  });

});
