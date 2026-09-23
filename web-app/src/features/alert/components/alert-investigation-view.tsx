/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import { InvestigationAvailability } from '@/features/explore';

import type {
  AlertInvestigationTraceSummary,
  AlertInvestigationViewState
} from '../model/alert-investigation-contract';
import { AlertCollectionSection, AlertTopologySection } from './alert-investigation-context-evidence';
import { AlertInvestigationHeader } from './alert-investigation-header';
import { AlertLogsSection, AlertMetricsSection } from './alert-investigation-signal-runtime';
import { AlertTracesSection } from './alert-investigation-traces';
import styles from './alert-investigation-view.module.css';

type ReadyState = Extract<AlertInvestigationViewState, { kind: 'ready' }>;
type LogRecord = ReadyState['snapshot']['logs']['records'][number];

export function AlertInvestigationView({
  state,
  onBack,
  onOpenMetric,
  onOpenLog,
  onOpenTrace,
  onOpenTopology
}: {
  state: ReadyState;
  onBack: () => void;
  onOpenMetric?: (() => void) | undefined;
  onOpenLog: (record: LogRecord) => void;
  onOpenTrace: (trace: AlertInvestigationTraceSummary) => void;
  onOpenTopology?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const stateLabels = {
    ready: t('alertInvestigation.states.available'),
    empty: t('alertInvestigation.states.empty'),
    unavailable: t('alertInvestigation.states.unavailable')
  };
  return (
    <main className={styles.workspace} data-alert-investigation="true" aria-label={t('alertInvestigation.title')}>
      <AlertInvestigationHeader route={state.route} snapshot={state.snapshot} onBack={onBack} />
      <InvestigationAvailability
        ariaLabel={t('alertInvestigation.availability')}
        stateLabels={stateLabels}
        items={[
          { key: 'metrics', label: t('alertInvestigation.sections.metrics'), state: state.snapshot.metrics.state },
          { key: 'logs', label: t('alertInvestigation.sections.logs'), state: state.snapshot.logs.state },
          { key: 'traces', label: t('alertInvestigation.sections.traces'), state: state.snapshot.traces.state },
          { key: 'topology', label: t('alertInvestigation.sections.topology'), state: state.snapshot.topology.state },
          {
            key: 'collection',
            label: t('alertInvestigation.sections.collection'),
            state: state.snapshot.collection.state
          }
        ]}
      />
      <AlertMetricsSection state={state} onOpen={onOpenMetric} />
      <AlertLogsSection state={state} onOpenLog={onOpenLog} />
      <AlertTracesSection state={state} onOpen={onOpenTrace} />
      <AlertTopologySection state={state} onOpen={onOpenTopology} />
      <AlertCollectionSection state={state} />
    </main>
  );
}
