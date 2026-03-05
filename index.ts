import { ChatCommand, LogCommand, type ICommand } from "./commands";
import type { EnvironmentMessage, StepState } from "./messages";
import { executeStrategyForStep } from "./strategy";

const consoleIterator = console[Symbol.asyncIterator]();

console.log("bot-start"); // mandatory!

const environment = await readMessage<EnvironmentMessage>("environment"); // mandatory!

// process killed when runner feels it necessary
while (true) {
  const state = await readMessage<StepState>("state"); // mandatory!

  // Patch weird rotations:
  const normalize = (h: number) => ((h % 360) + 360) % 360;
  state.Tank.Heading = normalize(state.Tank.Heading);
  state.Tank.TurretHeading = normalize(state.Tank.TurretHeading);
  state.TankScans.forEach(t => {
    t.Heading = normalize(t.Heading);
    t.TurretHeading = normalize(t.TurretHeading);
  });
  
  const commands: ICommand[] = [executeStrategyForStep(environment, state)];

  if (state.Tank.Id === 0) {
    commands.push(
        new LogCommand(``
        + ` | Health = ${String(state.Tank.Health.Value).padStart(2)}`
        + ` | Gun = ${String(state.Tank.GunEnergy.Value).padStart(2)}`
        + ` | Location = ${String(Math.round(state.Tank.Location.X)).padStart(3)}, ${String(Math.round(state.Tank.Location.Y)).padStart(3)}`
        + ` | Velocity = ${state.Tank.Velocity}`
        + ` | Heading = ${String(state.Tank.Heading).padStart(3)}`
        + ` | TurretHeading = ${String(state.Tank.TurretHeading).padStart(3)}`
        + ` | Chat = ${String(state.Tank.ChatEnergy.Value).padStart(2)}`
        ),
    );
    
    if (state.Tank.ChatEnergy.Value === state.Tank.ChatEnergy.Max) {
        commands.push(new ChatCommand(`I'm ${environment.Tanks.find(t => t.Id === state.Tank.Id)?.TeamName} #${state.Tank.Id}`));
    }
  }

  for (const command of commands) {
    console.log(command.toCommandString());
  }

  console.log("command-end"); // mandatory!
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
