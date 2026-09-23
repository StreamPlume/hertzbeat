/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type { PersesSignalRuntimeProps } from './perses-signal-runtime';
import { PersesSignalRuntime } from './perses-signal-runtime';

export type PersesTimeSeriesRuntimeProps = Extract<PersesSignalRuntimeProps, { kind: 'metric-time-series' }>;

/**
 * Stable metric-only production entry that keeps the heavier Perses runtime outside the application shell.
 */
export function PersesTimeSeriesRuntime(props: PersesTimeSeriesRuntimeProps) {
  return <PersesSignalRuntime {...props} />;
}
