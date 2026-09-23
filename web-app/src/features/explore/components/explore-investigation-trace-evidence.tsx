/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import {
  HertzBeatLogsTableResult,
  type HertzBeatPersesPrimitiveMessages,
  type HertzBeatLogQueryOutcome,
  type HertzBeatTraceGanttQueryOutcome
} from '@/platform/perses';

import type { InvestigationEvidenceState, InvestigationPersesResults } from '../model/explore-investigation-contract';
import { InvestigationTracePrimary } from './explore-investigation-trace-primary';
import { InvestigationBlockState, InvestigationSection } from './explore-investigation-view-primitives';

type ReadyGantt = NonNullable<InvestigationPersesResults['gantt']> & {
  outcome: Extract<HertzBeatTraceGanttQueryOutcome, { state: 'ready' }>;
};
type ReadyLogs = NonNullable<InvestigationPersesResults['logs']> & {
  outcome: Extract<HertzBeatLogQueryOutcome, { state: 'ready' }>;
};
type Props = {
  perses: InvestigationPersesResults;
  ganttState: InvestigationEvidenceState;
  logsState: InvestigationEvidenceState;
  selectedSpanId?: string | undefined;
  evidenceCurrent: boolean;
  messages: HertzBeatPersesPrimitiveMessages;
  onSelectSpan: (spanId: string) => void;
  onOpenLogs: () => void;
};

export function InvestigationTraceEvidence(props: Props) {
  const { t } = useTranslation();
  const gantt = readyGantt(props.perses.gantt);
  const logs = readyLogs(props.perses.logs);
  return (
    <>
      <InvestigationSection title={t('exploreInvestigation.sections.traces')} evidenceCurrent={props.evidenceCurrent}>
        {gantt ? (
          <InvestigationTracePrimary
            panel={gantt}
            selectedSpanId={props.selectedSpanId}
            evidenceCurrent={props.evidenceCurrent}
            messages={props.messages}
            onSelectSpan={props.onSelectSpan}
          />
        ) : (
          <InvestigationBlockState state={nonReady(props.ganttState)} />
        )}
      </InvestigationSection>
      <InvestigationSection
        title={t('exploreInvestigation.sections.logs')}
        action={logs ? props.onOpenLogs : undefined}
        actionLabel={t('exploreInvestigation.actions.openLogs')}
        evidenceCurrent={props.evidenceCurrent}
      >
        {logs ? (
          <HertzBeatLogsTableResult
            title={t('exploreInvestigation.sections.logs')}
            ariaLabel={t('exploreInvestigation.sections.logs')}
            messages={props.messages}
            query={logs.query}
            outcome={logs.outcome}
          />
        ) : (
          <InvestigationBlockState state={nonReady(props.logsState)} />
        )}
      </InvestigationSection>
    </>
  );
}

function readyGantt(panel: InvestigationPersesResults['gantt']): ReadyGantt | undefined {
  return panel?.outcome.state === 'ready' ? { ...panel, outcome: panel.outcome } : undefined;
}

function readyLogs(panel: InvestigationPersesResults['logs']): ReadyLogs | undefined {
  return panel?.outcome.state === 'ready' ? { ...panel, outcome: panel.outcome } : undefined;
}

function nonReady(state: InvestigationEvidenceState): 'empty' | 'unavailable' {
  return state === 'empty' ? 'empty' : 'unavailable';
}
