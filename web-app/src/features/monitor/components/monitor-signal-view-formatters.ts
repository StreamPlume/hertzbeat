/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type {
  MonitorInvestigationSnapshot,
  MonitorInvestigationViewState,
  MonitorSignalState
} from '../model/monitor-investigation-model';
import type { MonitorSignalCapabilityState } from '../model/monitor-signal-view-model';

export function monitorInvestigationSnapshot(
  state: MonitorInvestigationViewState
): MonitorInvestigationSnapshot | undefined {
  return state.kind === 'ready' ? state.snapshot : undefined;
}

export function monitorInvestigationSectionState(
  investigation: MonitorInvestigationViewState,
  state: MonitorSignalState | undefined
): MonitorSignalCapabilityState {
  if (state) return state;
  return investigation.kind === 'unavailable' ? 'unavailable' : 'unknown';
}

export function formatMonitorTimestamp(value: number, timeZone?: string) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      ...(timeZone ? { timeZone } : {})
    }).format(value);
  } catch {
    return undefined;
  }
}

export function formatMonitorDuration(value: number) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ms`;
}
