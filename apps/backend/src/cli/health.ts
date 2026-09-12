/**
 * CLI: check every configured news provider and print its health.
 *
 *   npm run -w @ogii/backend health
 */
import { createContainer } from '../container';
import { toErrorMessage } from '../util/errors';

async function main(): Promise<void> {
  const container = await createContainer();
  const results = await Promise.allSettled(
    container.providers.map(async (provider) => ({ provider, health: await provider.healthCheck() })),
  );

  process.stdout.write('\n  Provider health\n\n');
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { provider, health } = result.value;
      process.stdout.write(
        `  ${health.healthy ? 'OK  ' : 'FAIL'}  ${provider.id.padEnd(18)} tier ${provider.defaultTier}  ${health.message}\n`,
      );
    } else {
      process.stdout.write(`  FAIL  (threw) ${toErrorMessage(result.reason)}\n`);
    }
  }
  process.stdout.write('\n');
  await container.shutdown();
}

main().catch((error: unknown) => {
  process.stderr.write(`health check failed: ${toErrorMessage(error)}\n`);
  process.exit(1);
});
