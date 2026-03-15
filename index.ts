import { createBanter } from "./chat";
import { type ICommand } from "./commands";
import type { EnvironmentMessage, StepState } from "./messages";
import { executeStrategyForStep } from "./strategy";

const consoleIterator = console[Symbol.asyncIterator]();

console.log("bot-start"); // mandatory!

const environment = await readMessage<EnvironmentMessage>("environment"); // mandatory!

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
    
  if (state.Tank.ChatEnergy.Value === state.Tank.ChatEnergy.Max) {
    if (Math.random() < 0.02) {
      commands.push(createBanter(environment, state));
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
