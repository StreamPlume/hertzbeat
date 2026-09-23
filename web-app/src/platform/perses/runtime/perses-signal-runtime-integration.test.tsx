/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/runtime-theme-context', () => ({ useRuntimeTheme: () => ({ theme: 'light' }) }));
import { PersesSignalRuntime } from './perses-signal-runtime';

const timeWindow = { from: 1_750_000_000_000, to: 1_750_000_060_000 } as const;

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  readonly observe = (target: Element) => {
    this.callback(
      [{ target, contentRect: { width: 800, height: 360 } as DOMRectReadOnly } as ResizeObserverEntry],
      this
    );
  };
  readonly unobserve = () => undefined;
  readonly disconnect = () => undefined;
}

vi.stubGlobal('ResizeObserver', TestResizeObserver);
const canvasMethod = vi.fn();
const canvasTarget: Record<string, unknown> = {
  canvas: document.createElement('canvas'),
  measureText: () => ({ width: 80 }),
  createLinearGradient: () => ({ addColorStop: canvasMethod }),
  createRadialGradient: () => ({ addColorStop: canvasMethod }),
  createPattern: () => null
};
const canvasContext = new Proxy(canvasTarget, {
  get: (target, property: string) => target[property] ?? canvasMethod,
  set: (target, property: string, value) => {
    target[property] = value;
    return true;
  }
});
describe('Perses official signal panel integration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as never);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads and renders the four official panel implementations with snapshot query data', async () => {
    const metric = render(
      <PersesSignalRuntime
        kind="metric-time-series"
        title="Metric"
        timeWindow={timeWindow}
        data={{
          timeRange: { start: new Date(timeWindow.from), end: new Date(timeWindow.to) },
          stepMs: 15_000,
          series: [{ name: 'up-0', formattedName: 'up', labels: {}, values: [[timeWindow.from, 1]] }]
        }}
      />
    );
    expectRuntimeFrame(metric.container, 'metric-time-series');
    await waitFor(() => expect(metric.container.querySelector('canvas')).not.toBeNull());
    metric.unmount();

    const logs = render(
      <PersesSignalRuntime
        kind="logs-table"
        title="Logs"
        timeWindow={timeWindow}
        data={{
          entries: [{ timestamp: timeWindow.from / 1_000, line: 'checkout ready', labels: { severity: 'INFO' } }]
        }}
      />
    );
    expectRuntimeFrame(logs.container, 'logs-table');
    expect((timeWindow.from / 1_000) * 1_000).toBe(timeWindow.from);
    expect(await screen.findByTestId('virtuoso-scroller')).toBeInTheDocument();
    const expandLog = await screen.findByRole('button', { name: 'Expand log details' });
    expect(expandLog).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandLog);
    expect(await screen.findByRole('button', { name: 'Collapse log details' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    cleanup();

    const traces = render(
      <PersesSignalRuntime
        kind="trace-table"
        title="Traces"
        timeWindow={timeWindow}
        data={{
          searchResult: [
            {
              traceId: '0123456789abcdef0123456789abcdef',
              rootServiceName: 'checkout',
              rootTraceName: 'POST /orders',
              startTimeUnixMs: timeWindow.from,
              durationMs: 10,
              serviceStats: { checkout: { spanCount: 1 } }
            }
          ]
        }}
      />
    );
    expectRuntimeFrame(traces.container, 'trace-table');
    expect(await screen.findByRole('grid')).toBeInTheDocument();
    expect(await screen.findByText('POST /orders')).toBeInTheDocument();
    cleanup();

    const gantt = render(
      <PersesSignalRuntime
        kind="tracing-gantt-chart"
        title="Trace"
        timeWindow={timeWindow}
        data={{
          trace: {
            resourceSpans: [
              {
                resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId: '0123456789abcdef0123456789abcdef',
                        spanId: '0123456789abcdef',
                        name: 'POST /orders',
                        startTimeUnixNano: '1750000000000000000',
                        endTimeUnixNano: '1750000000010000000'
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }}
      />
    );
    expectRuntimeFrame(gantt.container, 'tracing-gantt-chart');
    expect(await screen.findByRole('heading', { name: /checkout: POST \/orders/u })).toBeInTheDocument();
    expect(gantt.container.querySelector('[data-perses-primitive="tracing-gantt-chart"]')).not.toBeNull();
  });
});

function expectRuntimeFrame(container: HTMLElement, kind: string) {
  expect(container.querySelector(`[data-perses-primitive="${kind}"]`)).toHaveStyle({
    width: '100%',
    height: '100%'
  });
}
