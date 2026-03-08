import { describe, test, expect } from 'bun:test';
import { executeStrategyForStep } from './strategy';
import type { EnvironmentMessage, StepState, TankState } from './messages';

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

describe('executeStrategyForStep smoke tests', () => {

  test('center of map, no scans', () => {
    expectValidCommand(executeStrategyForStep(env, makeState()));
  });

  test('gun ready, enemy in line of fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { TurretHeading: 0 },
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 400, Y: 200 }, Heading: 180, TurretHeading: 0, Health: stat(5, 10), IsEnemy: true },
      ],
    })));
  });

  test('gun ready, friendly blocking line of fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { TurretHeading: 0 },
      TankScans: [
        { TankId: 1, Name: 'Ally', Location: { X: 400, Y: 200 }, Heading: 180, TurretHeading: 0, Health: stat(10, 10), IsEnemy: false },
      ],
    })));
  });

  test('near top wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 20 }, Heading: 350 },
    })));
  });

  test('near bottom wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 400, Y: 780 }, Heading: 180 },
    })));
  });

  test('near left wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 20, Y: 400 }, Heading: 270 },
    })));
  });

  test('near right wall, heading toward it', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 780, Y: 400 }, Heading: 90 },
    })));
  });

  test('top-left corner', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 50, Y: 50 }, Heading: 315 },
    })));
  });

  test('turret pointing outward (away from center)', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Location: { X: 100, Y: 400 }, TurretHeading: 270 },
    })));
  });

  test('at max speed, gun not ready', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Velocity: 8, GunEnergy: stat(5, 15) },
    })));
  });

  test('multiple enemies visible', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      TankScans: [
        { TankId: 2, Name: 'Enemy1', Location: { X: 300, Y: 300 }, Heading: 90,  TurretHeading: 0, Health: stat(8, 10), IsEnemy: true },
        { TankId: 3, Name: 'Enemy2', Location: { X: 500, Y: 300 }, Heading: 270, TurretHeading: 0, Health: stat(6, 10), IsEnemy: true },
      ],
    })));
  });

  test('nearby healing powerup, low health', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(3, 10) },
      PowerupScans: [{ Id: 1, Location: { X: 450, Y: 400 }, Type: 'Healing' }],
    })));
  });

  test('taking damage', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Tank: { Health: stat(7, 10) },
      Hits: [{ TankId: 2, Name: 'Enemy1', Damage: 1 }],
    })));
  });

  test('late step, gun fully charged, no recent fire', () => {
    expectValidCommand(executeStrategyForStep(env, makeState({
      Step: 500,
    })));
  });

});
