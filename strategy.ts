import { AccelerateCommand, ReverseCommand, BrakeCommand, RotateCommand, RotateTurretCommand, FireGunCommand, type IStepCommand } from './commands';
import type { EnvironmentMessage, StepState, Vector } from './messages';

interface BotMemory {
  role: 'top' | 'left' | 'bottom';
  sweepHoldTicks: number;
  sweepDir: number;
  patrolDir: number;
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

function distance(a: Vector, b: Vector): number {
  return Math.sqrt((a.X - b.X)**2 + (a.Y - b.Y)**2);
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
      sweepHoldTicks: 0,
      sweepDir: 1,
      patrolDir: 1
    };
    MEMORY[me.Id] = mem;
  }
  
  if (mem.sweepHoldTicks > 0) mem.sweepHoldTicks--;

  const w = environment.MapSize.Width;
  const h = environment.MapSize.Height;
  const margin = 80;

  let currentTarget: Vector = { X: w/2, Y: h/2 };
  if (mem.role === 'top') {
    if (me.Location.Y > margin + 50) {
      currentTarget = { X: me.Location.X, Y: margin };
    } else {
      currentTarget = mem.patrolDir === 1 ? { X: w - margin, Y: margin } : { X: margin, Y: margin };
    }
  } else if (mem.role === 'left') {
    if (me.Location.X > margin + 50) {
      currentTarget = { X: margin, Y: me.Location.Y };
    } else {
      currentTarget = mem.patrolDir === 1 ? { X: margin, Y: h - margin } : { X: margin, Y: margin };
    }
  } else {
    if (me.Location.Y < h - margin - 50) {
      currentTarget = { X: me.Location.X, Y: h - margin };
    } else {
      currentTarget = mem.patrolDir === 1 ? { X: w - margin, Y: h - margin } : { X: margin, Y: h - margin };
    }
  }
  
  if (distance(me.Location, currentTarget) < margin) {
    mem.patrolDir *= -1;
  }

  const safety = 40;
  const rad = (me.Heading - 90) * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const towardTop = dy < 0 && me.Location.Y < safety;
  const towardBottom = dy > 0 && me.Location.Y > h - safety;
  const towardLeft = dx < 0 && me.Location.X < safety;
  const towardRight = dx > 0 && me.Location.X > w - safety;

  if (towardTop || towardBottom || towardLeft || towardRight) {
    return new RotateCommand(10);
  }

  if (me.GunEnergy.Value >= 1) {
    const enemies = state.TankScans.filter((s) => s.IsEnemy);
    const friends = state.TankScans.filter((s) => !s.IsEnemy);
    if (enemies.length > 0 && friends.length === 0) {
      return new FireGunCommand();
    }
  }

  let targetAngle = Math.atan2(currentTarget.Y - me.Location.Y, currentTarget.X - me.Location.X) * 180 / Math.PI;
  targetAngle = normalizeAngle(targetAngle + 90);
  const headingDiff = angleDiff(me.Heading, targetAngle);

  if (Math.abs(headingDiff) > 5) {
     if (state.Step % 2 === 0 && me.Velocity < 7 && Math.abs(headingDiff) < 90) {
         return new AccelerateCommand();
     }
     return new RotateCommand(Math.sign(headingDiff) * 10);
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

  if (me.Velocity < 8) {
    if (state.Step % 2 !== 0 && mem.sweepHoldTicks <= 0) {
      return new AccelerateCommand();
    } else if (me.Velocity < 5)  {
      return new AccelerateCommand();
    }
  }

  if (mem.sweepHoldTicks <= 0) {
    mem.sweepHoldTicks = 10;
    const tdx = Math.cos((me.TurretHeading - 90) * Math.PI / 180);
    const tdy = Math.sin((me.TurretHeading - 90) * Math.PI / 180);
    let inwardSweepNeeded = false;
    if (me.Location.Y < 150 && tdy < -0.2) inwardSweepNeeded = true;
    if (me.Location.Y > h - 150 && tdy > 0.2) inwardSweepNeeded = true;
    if (me.Location.X < 150 && tdx < -0.2) inwardSweepNeeded = true;
    if (me.Location.X > w - 150 && tdx > 0.2) inwardSweepNeeded = true;

    if (inwardSweepNeeded) mem.sweepDir *= -1;
  }
  return new RotateTurretCommand(10 * mem.sweepDir);
}
