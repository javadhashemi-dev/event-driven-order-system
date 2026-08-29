import { config as loadEnv } from 'dotenv';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { PrismaInstrumentation } from '@prisma/instrumentation';

loadEnv({ quiet: true });

function createTracingSdk(): NodeSDK | undefined {
  if (process.env.OTEL_ENABLED === 'false') {
    return undefined;
  }

  const instance = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? 'event-driven-order-system',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.1',
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      new PinoInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  instance.start();

  const gracefulShutdown = () => {
    void instance.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', gracefulShutdown);
  process.once('SIGINT', gracefulShutdown);

  return instance;
}

// Starts automatically when this module is evaluated. It must be the FIRST
// import in main.ts so Redis/PG/Express are loaded after the SDK's
// require/ESM hooks are registered.
export const sdk = createTracingSdk();
