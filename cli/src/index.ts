import { Command } from 'commander';
import { auth } from './commands/auth.js';

const brand = process.env.MALAPOS ?? 'malapos';

const program = new Command()
  .name(brand)
  .description(`CLI for ${brand} — part of the Forjio commerce suite.`)
  .version('0.0.1');

program.addCommand(auth);

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
