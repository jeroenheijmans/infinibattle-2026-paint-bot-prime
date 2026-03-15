export interface ICommand {
  toCommandString(): string;
}

export type IStepCommand =
  | AccelerateCommand
  | ReverseCommand
  | BrakeCommand
  | RotateCommand
  | RotateTurretCommand
  | FireGunCommand;

export type IFreeCommand = ChatCommand | LogCommand;

// This is the exact opposite of ReverseCommand - both commands are equivalent except for the direction
export class AccelerateCommand {
  toCommandString(): string {
    return "accelerate";
  }
}

// This is the exact opposite of AccelerateCommand - both commands are equivalent except for the direction
export class ReverseCommand {
  toCommandString(): string {
    return "reverse";
  }
}

// Nearly never needed, unless you want to quickly come to a halt e.g. to avoid a bullet or wall collision
export class BrakeCommand {
  toCommandString(): string {
    return "brake";
  }
}

// Rotates tank body (the turret Heading remains as-is while the body rotates)
export class RotateCommand {
  constructor(public degrees: number) {}

  toCommandString(): string {
    return `rotate ${this.degrees}`;
  }
}

// The turret also determines the direction of the 10-degree scanner arc
export class RotateTurretCommand {
  constructor(public degrees: number) {}

  toCommandString(): string {
    return `rotate-turret ${this.degrees}`;
  }
}

export class FireGunCommand {
  toCommandString(): string {
    return "fire-gun";
  }
}

export class ChatCommand {
  constructor(public message: string) {}

  toCommandString(): string {
    return `chat ${this.message}`;
  }
}

// Only needed for human debugging
export class LogCommand {
  constructor(public message: string) {}

  toCommandString(): string {
    return `log ${this.message}`;
  }
}
