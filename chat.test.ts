import { describe, test, expect } from 'bun:test';
import { createBanter } from './chat';
import type { EnvironmentMessage, StepState, TankState } from './messages';

function makeEnv(overrides: Partial<EnvironmentMessage> = {}): EnvironmentMessage {
  return {
    MapSize: { Width: 800, Height: 800 },
    Tanks: [
      { Id: 0, TeamId: 0, Name: 'PaintBot', TeamName: 'Red', IsEnemy: false, IsYou: true },
      { Id: 1, TeamId: 1, Name: 'Enemy1',   TeamName: 'Blue', IsEnemy: true,  IsYou: false },
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

describe('createBanter smoke tests', () => {

  test('returns a ChatCommand at full health', () => {
    const result = createBanter(env, makeState());
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeLessThanOrEqual(50);
  });

  test('returns a ChatCommand at 1 health (critical)', () => {
    const result = createBanter(env, makeState({ Tank: { Health: stat(1, 10) } }));
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeLessThanOrEqual(50);
  });

  test('returns a ChatCommand when health is 2', () => {
    const result = createBanter(env, makeState({ Tank: { Health: stat(2, 10) } }));
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeLessThanOrEqual(50);
  });

  test('returns a ChatCommand when health is 3', () => {
    const result = createBanter(env, makeState({ Tank: { Health: stat(3, 10) } }));
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeLessThanOrEqual(50);
  });

  test('returns a ChatCommand at full health (10)', () => {
    const result = createBanter(env, makeState({ Tank: { Health: stat(10, 10) } }));
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeLessThanOrEqual(50);
  });

});
