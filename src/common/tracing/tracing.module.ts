import { Global, Injectable, Module } from '@nestjs/common';
import {
  context,
  Context,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  Tracer,
} from '@opentelemetry/api';

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean | undefined>;
  /**
   * W3C trace context carrier (e.g. event envelope `metadata`) to use as the
   * parent of this span. Falls back to the currently active context.
   */
  parentCarrier?: unknown;
}

@Injectable()
export class TracingService {
  private readonly tracer: Tracer = trace.getTracer(
    'event-driven-order-system',
  );

  /**
   * Runs `fn` inside a new span. If `parentCarrier` carries a `traceparent`,
   * the span continues that (possibly remote) context, enabling end-to-end
   * traces across the outbox/queue boundary.
   */
  async withSpan<T>(
    name: string,
    options: SpanOptions,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    const parentContext: Context = options.parentCarrier
      ? propagation.extract(ROOT_CONTEXT, options.parentCarrier)
      : context.active();
    const span = this.tracer.startSpan(
      name,
      { kind: options.kind, attributes: options.attributes },
      parentContext,
    );

    return context.with(trace.setSpan(parentContext, span), async () => {
      try {
        return await fn(span);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Stamps the currently active span context into a mutable carrier
   * (e.g. an event envelope's `metadata`) as `traceparent` / `tracestate`,
   * so the consumer can continue the trace.
   */
  injectContext(carrier: unknown): void {
    propagation.inject(context.active(), carrier);
  }
}

@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
