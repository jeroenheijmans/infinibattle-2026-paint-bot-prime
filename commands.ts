export interface ICommand {
    toCommandString(): string;
}

export class AccelerateCommand implements ICommand {
    toCommandString(): string {
        return "accelerate";
    }
}

export class ReverseCommand implements ICommand {
    toCommandString(): string {
        return "reverse";
    }
}

export class BrakeCommand implements ICommand {
    toCommandString(): string {
        return "brake";
    }
}

export class RotateCommand implements ICommand {
    constructor(public degrees: number) { }

    toCommandString(): string {
        return `rotate ${this.degrees}`;
    }
}

export class RotateTurretCommand implements ICommand {
    constructor(public degrees: number) { }

    toCommandString(): string {
        return `rotate-turret ${this.degrees}`;
    }
}

export class FireGunCommand implements ICommand {
    toCommandString(): string {
        return "fire-gun";
    }
}

export class ChatCommand implements ICommand {
    constructor(public message: string) { }

    toCommandString(): string {
        return `chat ${this.message}`;
    }
}

export class LogCommand implements ICommand {
    constructor(public message: string) { }

    toCommandString(): string {
        return `log ${this.message}`;
    }
}
