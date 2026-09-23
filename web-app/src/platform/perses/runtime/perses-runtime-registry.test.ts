/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Perses runtime registry', () => {
  afterEach(() => {
    vi.doUnmock('./perses-time-series-runtime');
    vi.doUnmock('./perses-signal-runtime');
    vi.resetModules();
  });

  it('lazily loads the production metric and multi-signal runtime entries', async () => {
    let timeSeriesLoads = 0;
    let multiSignalLoads = 0;
    vi.doMock('./perses-time-series-runtime', () => {
      timeSeriesLoads += 1;
      return { PersesTimeSeriesRuntime: () => null };
    });
    vi.doMock('./perses-signal-runtime', () => {
      multiSignalLoads += 1;
      return { PersesSignalRuntime: () => null };
    });

    const { loadPersesRuntime } = await import('./perses-runtime-registry');

    expect(timeSeriesLoads).toBe(0);
    expect(multiSignalLoads).toBe(0);

    await loadPersesRuntime('time-series');
    expect(timeSeriesLoads).toBe(1);
    expect(multiSignalLoads).toBe(0);

    await loadPersesRuntime('multi-signal');
    expect(multiSignalLoads).toBe(1);
  });
});
