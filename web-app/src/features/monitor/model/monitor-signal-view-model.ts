/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { MonitorMetricCatalogEvidence } from './monitor-detail-model';
import type { MonitorInvestigationViewState, MonitorSignalState } from './monitor-investigation-model';

export type MonitorSignalCapabilityState = MonitorSignalState | 'unknown';

export type MonitorSignalCapabilities = {
  nativeMetrics: MonitorSignalCapabilityState;
  currentAlerts: MonitorSignalCapabilityState;
  collection: MonitorSignalCapabilityState;
  boundEntity: MonitorSignalCapabilityState;
  otlpEvidence: MonitorSignalCapabilityState;
};

export function resolveMonitorSignalCapabilities(
  nativeMetrics: MonitorMetricCatalogEvidence,
  investigation: MonitorInvestigationViewState
): MonitorSignalCapabilities {
  const fallback = unresolvedInvestigationState(investigation);
  if (investigation.kind !== 'ready') {
    return {
      nativeMetrics: nativeMetricCapability(nativeMetrics),
      currentAlerts: fallback,
      collection: fallback,
      boundEntity: fallback,
      otlpEvidence: fallback
    };
  }
  const { snapshot } = investigation;
  return {
    nativeMetrics: nativeMetricCapability(nativeMetrics),
    currentAlerts: snapshot.alerts.state,
    collection: snapshot.collection.state,
    boundEntity: snapshot.binding.state,
    otlpEvidence: otlpCapability(snapshot.binding)
  };
}

function nativeMetricCapability(catalog: MonitorMetricCatalogEvidence): MonitorSignalCapabilityState {
  if (catalog.kind === 'ready') return 'ready';
  if (catalog.kind === 'empty' || catalog.kind === 'unavailable') return catalog.kind;
  return 'unknown';
}

function unresolvedInvestigationState(state: MonitorInvestigationViewState): MonitorSignalCapabilityState {
  return state.kind === 'unavailable' ? 'unavailable' : 'unknown';
}

function otlpCapability(
  binding: Extract<MonitorInvestigationViewState, { kind: 'ready' }>['snapshot']['binding']
): MonitorSignalCapabilityState {
  if (binding.identity === null) return 'unavailable';
  return binding.identity.signals.length > 0 ? 'ready' : 'empty';
}
