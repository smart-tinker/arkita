import { app } from 'electron';
const index = process.argv.indexOf('--cli');
if (index >= 0) {
  const { runCLI } = await import('../scripts/arkita-cli.mjs');
  const result = await runCLI(process.argv.slice(index + 1));
  await new Promise(resolve => process.stdout.write(JSON.stringify(result) + '\n', resolve));
  app.exit(result.exitCode);
} else await import('./main.mjs');
