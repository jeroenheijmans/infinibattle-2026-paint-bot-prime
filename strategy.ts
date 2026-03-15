import { AccelerateCommand, ReverseCommand, BrakeCommand, RotateCommand, RotateTurretCommand, FireGunCommand, type IStepCommand } from './commands';
import type { EnvironmentMessage, StepState, Vector } from './messages';

interface BotMemory {
  role: 'top' | 'left' | 'bottom';
  holdDirTicks: number;
  sweepHoldTicks: number;
  sweepDir: number;
  patrolDir: number;
  lastTurnHeading: number;
}

const MEMORY: Record<number, BotMemory> = {};

function normalizeAngle(a: number): number {
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}

function angleDiff(a: number, b: number): number {
  let diff = normalizeAngle(b - a);
  if (diff > 180) diff -= 360;
  return diff;
}

export function executeStrategyForStep(
  environment: EnvironmentMessage,
  state: StepState
): IStepCommand {
  const me = state.Tank;
  let mem = MEMORY[me.Id];
  if (!mem) {
    const r = me.Id % 3;
    mem = {
      role: r === 0 ? 'top' : r === 1 ? 'left' : 'bottom',
      holdDirTicks: 0,
      sweepHoldTicks: 0,
      sweepDir: 1,
      patrolDir: 1,
      lastTurnHeading: me.Heading
    };
    MEMORY[me.Id] = mem;
  }
  
  if (mem.holdDirTicks > 0) mem.holdDirTicks--;
  if (mem.sweepHoldTicks > 0) mem.sweepHoldTicks--;

  const w = environment.MapSize.Width;
  const h = environment.MapSize.Height;
  const safety = 40;
  const rad = (me.Heading - 90) * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const towardTop = dy < 0 && me.Location.Y < safety;
  const towardBottom = dy > 0 && me.Location.Y > h - safety;
  const towardLeft = dx < 0 && me.Location.X < safety;
  const towardRight = dx > 0 && me.Location.X > w - safety;

  if (mem.holdDirTicks > 0 || towardTop || towardBottom || towardLeft || towardRight) {
    if (mem.holdDirTicks === 0) {
      mem.holdDirTicks = 15;
    }
    return new RotateCommand(10 * mem.sweepDir);
  }

  if (me.GunEnergy.Value >= 1) {
    const enemies = state.TankScans.filter((s) => s.IsEnemy);
    const friends = state.TankScans.filter((s) => !s.IsEnemy);
    if (enemies.length > 0 && friends.length === 0) {
      return new FireGunCommand();
    }
  }

  const enemies = state.TankScans.filter((s) => s.IsEnemy);
  const e = enemies[0];
  if (e) {
    let angleToEnemy = Math.atan2(e.Location.Y - me.Location.Y, e.Location.X - me.Location.X) * 180 / Math.PI;
    angleToEnemy = normalizeAngle(angleToEnemy + 90);
    const diff = angleDiff(me.TurretHeading, angleToEnemy);
    if (Math.abs(diff) > 2) {
      mem.sweepHoldTicks = 10;
      return new RotateTurretCommand(Math.sign(diff) * Math.min(10, Math.abs(diff)));
    }
  }

  if (me.Velocity < 7) {
    return new AccelerateCommand();
  } else {
    if (mem.sweepHoldTicks <= 0) {
      mem.sweepHoldTicks = 10;
      const tdx = Math.cos((me.TurretHeading - 90) * Math.PI / 180);
      const tdy = Math.sin((me.TurretHeading - 90) * Math.PI / 180);
      let inwardSweepNeeded = false;
      if (me.Location.Y < 100 && tdy < -0.5) inwardSweepNeeded = true;
      if (me.Location.Y > h - 100 && tdy > 0.5) inwardSweepNeeded = true;
      if (me.Location.X < 100 && tdx < -0.5) inwardSweepNeeded = true;
      if (me.Location.X > w - 100 && tdx > 0.5) inwardSweepNeeded = true;

      if (inwardSweepNeeded) mem.sweepDir *= -1;
    }
    return new RotateTurretCommand(10 * mem.sweepDir);
  }
}
