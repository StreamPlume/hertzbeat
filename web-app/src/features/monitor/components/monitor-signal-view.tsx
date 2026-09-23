/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import type { InvestigationTimeWindow, SignalKind } from '@/shared/query-context';

import type { MonitorMetricCatalogEvidence } from '../model/monitor-detail-model';
import type { MonitorInvestigationViewState } from '../model/monitor-investigation-model';
import { MonitorSignalAlerts } from './monitor-signal-alerts';
import { MonitorSignalAvailability } from './monitor-signal-availability';
import { MonitorBoundEntitySection, MonitorOtlpEvidenceSection } from './monitor-signal-binding';
import { MonitorSignalCollection } from './monitor-signal-collection';
import styles from './monitor-signal-view.module.css';

type MonitorSignalViewProps = {
  state: MonitorInvestigationViewState;
  nativeMetrics: MonitorMetricCatalogEvidence;
  openSignal: (signal: SignalKind) => void;
  openEntity: (entityId: number, window: InvestigationTimeWindow) => void;
};

export function MonitorSignalView({ state, nativeMetrics, openSignal, openEntity }: MonitorSignalViewProps) {
  const { t } = useTranslation();
  return (
    <section className={styles.workspace} aria-label={t('monitorSignals.title')}>
      <MonitorSignalAvailability nativeMetrics={nativeMetrics} state={state} />
      <div className={styles.evidenceGrid}>
        <MonitorSignalAlerts state={state} />
        <MonitorSignalCollection state={state} />
        <MonitorBoundEntitySection state={state} openEntity={openEntity} />
        <MonitorOtlpEvidenceSection state={state} openSignal={openSignal} />
      </div>
    </section>
  );
}
