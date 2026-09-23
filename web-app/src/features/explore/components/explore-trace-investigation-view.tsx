/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import type {
  InvestigationBlock,
  InvestigationEvidenceState,
  TraceInvestigationViewState
} from '../model/explore-investigation-contract';
import { InvestigationMetrics } from './explore-investigation-metrics';
import { investigationPrimitiveMessages } from './explore-investigation-messages';
import { InvestigationTraceEvidence } from './explore-investigation-trace-evidence';
import {
  InvestigationAvailability,
  InvestigationBlockState,
  InvestigationContextBand,
  InvestigationSection
} from './explore-investigation-view-primitives';
import traceStyles from './explore-investigation-trace.module.css';
import styles from './explore-investigation-view.module.css';

type ReadyState = Extract<TraceInvestigationViewState, { kind: 'ready' }>;
type Props = {
  state: ReadyState;
  evidenceCurrent: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onSelectSpan: (spanId: string) => void;
  onOpenLogs: () => void;
  onOpenMetrics?: (() => void) | undefined;
  onOpenTopology?: (() => void) | undefined;
};

export function ExploreTraceInvestigationView(props: Props) {
  const { state, evidenceCurrent } = props;
  const { t } = useTranslation();
  const { snapshot, perses } = state;
  const messages = investigationPrimitiveMessages(t);
  const ganttState = persesState(snapshot.gantt, perses.gantt);
  const logsState = persesState(snapshot.sameTraceLogs, perses.logs);
  const metricsState = combinedMetricsState(state);
  return (
    <section
      className={styles.workspace}
      data-explore-investigation="true"
      aria-label={t('exploreInvestigation.title')}
    >
      <InvestigationContextBand window={state.route.window} onBack={props.onBack} onRefresh={props.onRefresh} />
      <TraceAvailability
        gantt={ganttState}
        logs={logsState}
        metrics={metricsState}
        topology={snapshot.dependencies.state}
      />
      <InvestigationTraceEvidence
        perses={perses}
        ganttState={ganttState}
        logsState={logsState}
        selectedSpanId={snapshot.selectedSpanId ?? undefined}
        evidenceCurrent={evidenceCurrent}
        messages={messages}
        onSelectSpan={props.onSelectSpan}
        onOpenLogs={props.onOpenLogs}
      />
      <MetricsSection
        state={state}
        evidenceCurrent={evidenceCurrent}
        messages={messages}
        onOpen={props.onOpenMetrics}
      />
      <TopologySection state={state} evidenceCurrent={evidenceCurrent} onOpen={props.onOpenTopology} />
    </section>
  );
}

function TraceAvailability({
  gantt,
  logs,
  metrics,
  topology
}: Record<'gantt' | 'logs' | 'metrics' | 'topology', InvestigationEvidenceState>) {
  const { t } = useTranslation();
  return (
    <InvestigationAvailability
      items={[
        { key: 'traces', label: t('exploreInvestigation.sections.traces'), state: gantt },
        { key: 'logs', label: t('exploreInvestigation.sections.logs'), state: logs },
        { key: 'metrics', label: t('exploreInvestigation.sections.metrics'), state: metrics },
        { key: 'topology', label: t('exploreInvestigation.sections.topology'), state: topology }
      ]}
    />
  );
}

function MetricsSection({
  state,
  evidenceCurrent,
  messages,
  onOpen
}: {
  state: ReadyState;
  evidenceCurrent: boolean;
  messages: ReturnType<typeof investigationPrimitiveMessages>;
  onOpen?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const serviceMetricsReady =
    state.snapshot.metrics.state === 'ready' && state.perses.metrics.some(panel => panel.outcome.state === 'ready');
  return (
    <InvestigationSection
      title={t('exploreInvestigation.sections.metrics')}
      action={serviceMetricsReady && onOpen ? onOpen : undefined}
      actionLabel={t('exploreInvestigation.actions.openMetrics')}
      evidenceCurrent={evidenceCurrent}
    >
      <InvestigationMetrics
        red={state.snapshot.red}
        metricBlock={state.snapshot.metrics}
        panels={state.perses.metrics}
        messages={messages}
      />
    </InvestigationSection>
  );
}

function TopologySection({
  state,
  evidenceCurrent,
  onOpen
}: {
  state: ReadyState;
  evidenceCurrent: boolean;
  onOpen?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const block = state.snapshot.dependencies;
  return (
    <InvestigationSection
      title={t('exploreInvestigation.sections.topology')}
      action={onOpen}
      actionLabel={t('exploreInvestigation.actions.openTopology')}
      evidenceCurrent={evidenceCurrent}
    >
      {block.state === 'ready' ? (
        <div className={traceStyles.dependencies}>
          <p>{t('exploreInvestigation.topology.scope')}</p>
          <ul>
            {block.edges.map(edge => (
              <li key={`${edge.spanId}-${edge.sourceServiceName}-${edge.targetServiceName}`}>
                <strong>{`${edge.sourceServiceName} → ${edge.targetServiceName}`}</strong>
                <span>
                  {t('exploreInvestigation.topology.downstream')} · {edge.status} · {edge.durationMillis} ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <InvestigationBlockState state={block.state} />
      )}
    </InvestigationSection>
  );
}

function persesState(
  block: InvestigationBlock,
  panel: { outcome: { state: string } } | undefined
): InvestigationEvidenceState {
  if (block.state !== 'ready') return block.state;
  if (panel?.outcome.state === 'ready') return 'ready';
  return panel?.outcome.state === 'empty' ? 'empty' : 'unavailable';
}

function combinedMetricsState(state: ReadyState): InvestigationEvidenceState {
  if (state.snapshot.red.state === 'ready' && state.snapshot.red.summary) return 'ready';
  if (state.snapshot.metrics.state === 'ready' && state.perses.metrics.some(panel => panel.outcome.state === 'ready'))
    return 'ready';
  if (state.snapshot.red.state === 'empty' && state.snapshot.metrics.state === 'empty') return 'empty';
  return 'unavailable';
}
