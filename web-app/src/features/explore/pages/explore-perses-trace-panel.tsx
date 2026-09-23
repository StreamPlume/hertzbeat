/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { HertzBeatTraceTableResult, type HertzBeatPersesTableInteraction } from '@/platform/perses';
import { usePublishShellInvestigation } from '@/shared/investigation';
import type { ExactTimeWindow } from '@/shared/query-context';

import { ExploreHistoryPagination } from '../components/explore-history-pagination';
import { explorePersesMessages } from '../components/explore-perses-messages';
import { ExploreMessageResult, ExploreResultFrame } from '../components/explore-state-panel';
import { SignalEmptyState, SignalResultFrame } from '../components/signal-result-frame';
import { materializeTraceInvestigation } from '../model/explore-agent-handoff';
import { buildTraceInvestigationPath } from '../model/explore-investigation-model';
import { createExploreTracePersesResult } from '../model/explore-perses-result-model';
import type { TraceExploreQuery } from '../model/explore-model';
import { ExploreSignalContractError, type ExplorePageResult, type TraceRow } from '../model/explore-signal-contract';

type Props = {
  data: ExplorePageResult<TraceRow>;
  query: TraceExploreQuery;
  openPath: (path: string) => void;
  timeWindow: ExactTimeWindow | undefined;
  revision: number;
  evidenceCurrent: boolean;
};

export function ExplorePersesTracePanel(props: Props) {
  const { data, query, openPath, timeWindow, revision, evidenceCurrent } = props;
  const { t } = useTranslation();
  usePublishShellInvestigation(
    useMemo(
      () => materializeTraceInvestigation(query, undefined, evidenceCurrent ? timeWindow : undefined),
      [evidenceCurrent, query, timeWindow]
    )
  );
  if (!timeWindow) return <ExploreMessageResult kind="error" message={t('explore.states.contractError')} />;
  let result;
  try {
    result = createExploreTracePersesResult(query, data, timeWindow, revision);
  } catch (error) {
    if (!(error instanceof ExploreSignalContractError)) throw error;
    return <ExploreMessageResult kind="error" message={t('explore.states.contractError')} />;
  }
  return (
    <ExploreResultFrame>
      <SignalResultFrame title={t('explore.signals.traces')} count={data.totalElements}>
        {data.totalElements === 0 ? (
          <SignalEmptyState title={t('explore.empty.traces')} hint={t('explore.description')} />
        ) : (
          <HertzBeatTraceTableResult
            title={t('explore.signals.traces')}
            ariaLabel={t('explore.perses.tracesTable')}
            query={result.query}
            outcome={result.outcome}
            runtimeIdentity={result.runtimeIdentity}
            interactions={traceInteractions(data.content, query, timeWindow, evidenceCurrent, openPath, t)}
            messages={explorePersesMessages(t)}
          />
        )}
        <ExploreHistoryPagination page={data} query={query} enabled={evidenceCurrent} openPath={openPath} t={t} />
      </SignalResultFrame>
    </ExploreResultFrame>
  );
}

function traceInteractions(
  rows: TraceRow[],
  query: TraceExploreQuery,
  window: ExactTimeWindow,
  enabled: boolean,
  openPath: (path: string) => void,
  t: ReturnType<typeof useTranslation>['t']
): HertzBeatPersesTableInteraction[] {
  return rows.map(row => ({
    key: row.traceId,
    label: `${row.serviceName} · ${row.rootSpanName} · ${shortId(row.traceId)}`,
    actions: [
      {
        label: t('explore.perses.investigateTrace', { value: shortId(row.traceId) }),
        disabled: !enabled,
        onAction: () =>
          openPath(
            buildTraceInvestigationPath(
              query,
              {
                traceId: row.traceId,
                selectedSpanId: row.rootSpanId,
                startTime: row.startTime,
                durationNanos: row.durationNanos
              },
              window,
              browserTimeZone()
            )
          )
      }
    ]
  }));
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
