import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
// The same line as the backend's main.ts. Scheduling code parses naive date
// strings with a local-time parser, so it has to run in UTC; without this the
// orchestrator ran in whatever TZ its container was given.
process.env.TZ = 'UTC';
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { AppModule } from '@gitroom/orchestrator/app.module';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// nestjs-temporal-core does not retry a worker that could not reach Temporal
// at boot: it logs the error and the process stays up with nothing polling.
// On 2026-10-17 the host restarted, this process came up before Temporal
// accepted connections, and no post was published for 86 minutes while
// /health/status, which only asks Temporal, answered ok. Exiting instead lets
// pm2 start the process again, by which time Temporal is up.
async function exitWithoutWorkers(app: INestApplication) {
  const temporal = app.get(TemporalService);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      if ((temporal.getAllWorkers()?.runningWorkers ?? 0) > 0) {
        return;
      }
    } catch {
      // not initialized yet, which reads the same as no worker
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  Logger.error(
    'No Temporal worker is running, exiting so the process is restarted',
    'Orchestrator'
  );
  process.exit(1);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
  await exitWithoutWorkers(app);
}


bootstrap();
