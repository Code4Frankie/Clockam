import { createSimulator } from './simulator.js';
import { createSecugen } from './secugen.js';
import { createCommandAdapter } from './command.js';

// A driver is an object with: name, isReady(), identify() -> scannerUserId | null, enroll(id), remove(id) -> boolean.
export function loadAdapter(name, env = process.env) {
  switch (name) {
    case 'simulator':
      return createSimulator({ fixedId: env.SIM_USER_ID || '' });
    case 'secugen':
      return createSecugen();
    case 'command':
      return createCommandAdapter({ command: env.BRIDGE_COMMAND, args: env.BRIDGE_COMMAND_ARGS ? env.BRIDGE_COMMAND_ARGS.split(' ').filter(Boolean) : [] });
    case 'digitalpersona':
      throw new Error('DigitalPersona readers need a small helper program built with the U.are.U SDK. Use BRIDGE_ADAPTER=command with BRIDGE_COMMAND pointing at it. See README.');
    default:
      throw new Error(`Unknown scanner driver "${name}". Available: simulator, secugen, command`);
  }
}
