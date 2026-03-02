export interface ICommand {
  toCommandString(): string;
}

export interface IStepCommand extends ICommand {
  // marker interface for commands of which you may only do 1 per game step
}

export class AccelerateCommand implements IStepCommand {
  toCommandString(): string {
    return "accelerate";
  }
}

export class ReverseCommand implements IStepCommand {
  toCommandString(): string {
    return "reverse";
  }
}

export class BrakeCommand implements IStepCommand {
  toCommandString(): string {
    return "brake";
  }
}

export class RotateCommand implements IStepCommand {
  constructor(public degrees: number) {}

  toCommandString(): string {
    return `rotate ${this.degrees}`;
  }
}

export class RotateTurretCommand implements IStepCommand {
  constructor(public degrees: number) {}

  toCommandString(): string {
    return `rotate-turret ${this.degrees}`;
  }
}

export class FireGunCommand implements IStepCommand {
  toCommandString(): string {
    return "fire-gun";
  }
}

export class ChatCommand implements ICommand {
  constructor(public message: string) {}

  toCommandString(): string {
    return `chat ${this.message}`;
  }
}

export class LogCommand implements ICommand {
  constructor(public message: string) {}

  toCommandString(): string {
    return `log ${this.message}`;
  }
}
