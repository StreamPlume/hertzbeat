/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';

import type { MonitorMetricCatalogEvidence } from '../model/monitor-detail-model';
import type { MonitorInvestigationViewState } from '../model/monitor-investigation-model';
import {
  resolveMonitorSignalCapabilities,
  type MonitorSignalCapabilities,
  type MonitorSignalCapabilityState
} from '../model/monitor-signal-view-model';
import styles from './monitor-signal-view.module.css';
import { formatMonitorTimestamp } from './monitor-signal-view-formatters';

const capabilityOrder: (keyof MonitorSignalCapabilities)[] = [
  'nativeMetrics',
  'currentAlerts',
  'collection',
  'boundEntity',
  'otlpEvidence'
];

export function MonitorSignalAvailability({
  nativeMetrics,
  state
}: {
  nativeMetrics: MonitorMetricCatalogEvidence;
  state: MonitorInvestigationViewState;
}) {
  const { t } = useTranslation();
  const capabilities = resolveMonitorSignalCapabilities(nativeMetrics, state);
  return (
    <section className={styles.availability} aria-label={t('monitorSignals.availability')}>
      <div className={styles.windowEvidence}>{windowLabel(state, t)}</div>
      <div className={styles.capabilityGrid}>
        {capabilityOrder.map(key => (
          <div className={styles.capability} data-state={capabilities[key]} key={key}>
            <span>{t(`monitorSignals.capabilities.${key}`)}</span>
            <CapabilityTag state={capabilities[key]} />
          </div>
        ))}
      </div>
    </section>
  );
}

function CapabilityTag({ state }: { state: MonitorSignalCapabilityState }) {
  const { t } = useTranslation();
  return <Tag color={capabilityColor(state)}>{t(`monitorSignals.states.${state}`)}</Tag>;
}

function capabilityColor(state: MonitorSignalCapabilityState) {
  if (state === 'ready') return 'green';
  if (state === 'unavailable') return 'orange';
  return 'default';
}

function windowLabel(state: MonitorInvestigationViewState, t: ReturnType<typeof useTranslation>['t']) {
  if (state.kind === 'inactive' || state.kind === 'invalid_window') return t('monitorSignals.windowUnavailable');
  const start = formatMonitorTimestamp(state.window.from, state.window.timeZone);
  const end = formatMonitorTimestamp(state.window.to, state.window.timeZone);
  if (!start || !end) return t('monitorSignals.windowUnavailable');
  return t('monitorSignals.window', { start, end, timeZone: state.window.timeZone });
}
