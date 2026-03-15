import { createBanter } from "./chat";
import { type ICommand } from "./commands";
import type { TankDetails } from "./helpers";
import type { EnvironmentMessage, StepState } from "./messages";
import { executeStrategyForStep } from "./strategy";

const consoleIterator = console[Symbol.asyncIterator]();

console.log("bot-start"); // mandatory!

const environment = await readMessage<EnvironmentMessage>("environment"); // mandatory!
const allObservedTankScanEvents: Record<number, TankDetails[]> = {};

function recordTankStates(state: StepState) {
  // Record my own state
  allObservedTankScanEvents[state.Tank.Id] = allObservedTankScanEvents[state.Tank.Id] || [];
  allObservedTankScanEvents[state.Tank.Id]?.push({
    Step: state.Step,
    TankId: state.Tank.Id,
    Location: state.Tank.Location,
    TurretHeading: state.Tank.TurretHeading,
    Heading: state.Tank.Heading,
    Health: state.Tank.Health,
    IsEnemy: false,
  });

  // Record scanned states, friends and enemies
  state.TankScans.forEach(s => {
    allObservedTankScanEvents[s.TankId] = allObservedTankScanEvents[s.TankId] || [];
    allObservedTankScanEvents[s.TankId]?.push({
      Step: state.Step,
      TankId: s.TankId,
      Location: s.Location,
      TurretHeading: s.TurretHeading,
      Heading: s.Heading,
      Health: s.Health,
      IsEnemy: s.IsEnemy,
    });
  });
}

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

  recordTankStates(state);
  
  const commands: ICommand[] = [executeStrategyForStep(environment, state, allObservedTankScanEvents)];

  // if (state.Tank.Id === 1 && state.Step % 25 === 0) {
  //   commands.push(new LogCommand(
  //     "Observations: " +
  //     Object.keys(allObservedTankScanEvents).map(k => allObservedTankScanEvents[k]?.length).join(", ")
  //   ))
  // }

  // if (state.Tank.Id === 0) {
  //   commands.push(
  //       new LogCommand(``
  //       + ` | Health = ${String(state.Tank.Health.Value).padStart(2)}`
  //       + ` | Gun = ${String(state.Tank.GunEnergy.Value).padStart(2)}`
  //       + ` | Location = ${String(Math.round(state.Tank.Location.X)).padStart(3)}, ${String(Math.round(state.Tank.Location.Y)).padStart(3)}`
  //       + ` | Velocity = ${state.Tank.Velocity}`
  //       + ` | Heading = ${String(state.Tank.Heading).padStart(3)}`
  //       + ` | TurretHeading = ${String(state.Tank.TurretHeading).padStart(3)}`
  //       + ` | Chat = ${String(state.Tank.ChatEnergy.Value).padStart(2)}`
  //       ),
  //   );
  // }
    
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
