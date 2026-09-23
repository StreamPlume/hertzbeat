/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { HertzBeatMetricQueryOutcome } from '@/platform/perses';
import type { ExactTimeWindow } from '@/shared/query-context';

import type { EntityRedPoint, EntityRedReadySignal } from './entity-signal-contract';

export function redMetricOutcomes(red: EntityRedReadySignal) {
  const window = { from: red.window.start, to: red.window.end };
  return {
    requestRate: metricOutcome(
      red,
      window,
      'request_rate_per_second',
      'requests/s',
      point => point.requestRatePerSecond
    ),
    errorRate: metricOutcome(red, window, 'error_rate', 'ratio', point => point.errorRate),
    latencyP95: metricOutcome(red, window, 'latency_p95_ms', 'milliseconds', point => point.latencyP95Ms)
  };
}

function metricOutcome(
  red: EntityRedReadySignal,
  timeWindow: ExactTimeWindow,
  name: string,
  unit: string,
  select: (point: EntityRedPoint) => number | null
): HertzBeatMetricQueryOutcome {
  const points = red.series.flatMap(point => {
    const value = select(point);
    return value == null ? [] : [{ timestamp: point.timestamp, value }];
  });
  if (points.length === 0) return { state: 'empty', truncated: false };
  return {
    state: 'ready',
    truncated: false,
    data: {
      timeWindow,
      source: red.source,
      series: [
        {
          key: `${name}-${red.identity.entityId}`,
          name,
          unit,
          labels: { entity_id: red.identity.entityId, source: red.source },
          points
        }
      ]
    }
  };
}
