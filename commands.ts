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

export class AccelerateCommand {
  toCommandString(): string {
    return "accelerate";
  }
}

export class ReverseCommand {
  toCommandString(): string {
    return "reverse";
  }
}

export class BrakeCommand {
  toCommandString(): string {
    return "brake";
  }
}

export class RotateCommand {
  constructor(public degrees: number) {}

  toCommandString(): string {
    return `rotate ${this.degrees}`;
  }
}

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

export class LogCommand {
  constructor(public message: string) {}

  toCommandString(): string {
    return `log ${this.message}`;
  }
}
