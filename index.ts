import {
    type ICommand,
    AccelerateCommand,
    RotateCommand,
    RotateTurretCommand,
    FireGunCommand
} from './commands';
import type { EnvironmentMessage, StepState } from './messages';

const consoleIterator = console[Symbol.asyncIterator]();

// First, announce that we are a bot
console.log("bot-start");

// Get some information about the game
const environment = await readMessage<EnvironmentMessage>("environment");

// Game loop, keep going forever
while (true) {
    // Read the current state of the game
    const state = await readMessage<StepState>("state");

    // Decide what you want your tank to do
    const commands: ICommand[] = [];
    switch (state.Step % 3) {
        case 0:
            commands.push(new RotateCommand(10));
            break;
        case 1:
            commands.push(state.Tank.GunEnergy.Value === state.Tank.GunEnergy.Max
                ? new FireGunCommand()
                : new RotateTurretCommand(10));
            break;
        default:
            commands.push(new AccelerateCommand());
            break;
    }
    // Send the commands to the game, you should always call this method exactly once per loop
    sendCommands(commands);
}

async function readMessage<TMessage>(type: string): Promise<TMessage> {
    const line = (await consoleIterator.next()).value;

    if (line && line.startsWith(type)) {
        const json = line.slice(type.length + 1);
        return JSON.parse(json) as TMessage;
    } else {
        throw new Error(`Expected message of type ${type}, but got: ${line}`);
    }
}

function sendCommands(commands: ICommand[]): void {
    for (const command of commands) {
        console.log(command.toCommandString());
    }

    console.log("command-end");
}
