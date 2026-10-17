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
import * as Sentry from '@sentry/nestjs';
import { AppModule } from '@gitroom/orchestrator/app.module';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// nestjs-temporal-core starts its workers before `listen` returns, but never
// retries one that could not reach Temporal at boot: it logs the error and the
// process stays up with nothing polling. It gives up the same way after three
// failed restarts of a worker that stopped later. On 2026-10-17 the host
// restarted, this process came up before Temporal accepted connections, and no
// post was published for 86 minutes while /health/status, which only asks
// Temporal, answered ok. So once a minute, for the life of the process, no
// running worker means exit, and pm2 starts the process again.
function exitWithoutWorkers(app: INestApplication) {
  const temporal = app.get(TemporalService);
  setInterval(async () => {
    let running = 0;
    try {
      running = temporal.getAllWorkers()?.runningWorkers ?? 0;
    } catch {
      // not initialized, which reads the same as no worker
    }
    if (running) {
      return;
    }

    Logger.error(
      'No Temporal worker is running, exiting so the process is restarted',
      'Orchestrator'
    );
    // Logger writes to stderr, which Sentry does not see.
    Sentry.captureMessage(
      'Orchestrator restarted: no Temporal worker was running',
      'error'
    );
    await Sentry.flush(2000);
    process.exit(1);
  }, 60000).unref();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await app.listen(port);
  console.log(`Orchestrator health check listening on port ${port}`);
  exitWithoutWorkers(app);
}


bootstrap();
