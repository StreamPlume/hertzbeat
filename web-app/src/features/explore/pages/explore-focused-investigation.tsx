/* Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type { TFunction } from 'i18next';

import { OperationalResultRegion } from '@/shared/operational-page';
import type { SharedTimeValue } from '@/shared/time';

import { ExploreLogInvestigationView } from '../components/explore-log-investigation-view';
import { ExploreLoadingResult, ExploreMessageResult } from '../components/explore-state-panel';
import { ExploreTraceInvestigationView } from '../components/explore-trace-investigation-view';
import { ExploreWorkbench } from '../components/explore-workbench';
import { useLogInvestigationController } from '../controller/use-log-investigation-controller';
import { useTraceInvestigationController } from '../controller/use-trace-investigation-controller';
import type { InvestigationLogRecord } from '../model/explore-investigation-contract';
import {
  buildLogInvestigationMetricsPath,
  buildLogInvestigationTopologyPath,
  buildTraceInvestigationMetricsPath,
  buildTraceInvestigationTopologyPath
} from '../model/explore-investigation-handoff-model';
import { buildCrossSignalPath, buildExplorePath, mergeExploreQuery } from '../model/explore-model';
import type { ExploreQueryPatch, LogExploreQuery, TraceExploreQuery } from '../model/explore-model';

type CommonProps = {
  t: TFunction;
  updateQuery: (changes: ExploreQueryPatch) => void;
  time: SharedTimeValue | null | undefined;
  openPath: (path: string) => void;
};

export function ExploreFocusedTracePage({ query, ...common }: CommonProps & { query: TraceExploreQuery }) {
  const investigation = useTraceInvestigationController(query);
  const state = investigation.state;
  const metricsPath = state.kind === 'ready' ? buildTraceInvestigationMetricsPath(query, state.snapshot) : undefined;
  const topologyPath = state.kind === 'ready' ? buildTraceInvestigationTopologyPath(state.snapshot) : undefined;
  return (
    <>
      <ExploreWorkbench query={query} t={common.t} updateQuery={common.updateQuery} />
      <OperationalResultRegion>
        {state.kind === 'ready' ? (
          <ExploreTraceInvestigationView
            state={state}
            evidenceCurrent
            onBack={() => common.openPath(backToResultsPath(query))}
            onRefresh={() => void investigation.refetch()}
            onSelectSpan={spanId => common.openPath(buildExplorePath(mergeExploreQuery(query, { spanId })))}
            onOpenLogs={() =>
              common.openPath(
                buildCrossSignalPath(query, 'logs', {
                  traceId: state.snapshot.traceId,
                  spanId: state.snapshot.selectedSpanId ?? undefined
                })
              )
            }
            {...(metricsPath ? { onOpenMetrics: () => common.openPath(metricsPath) } : {})}
            {...(topologyPath ? { onOpenTopology: () => common.openPath(topologyPath) } : {})}
          />
        ) : (
          <InvestigationRequestState state={state.kind} retry={investigation.refetch} t={common.t} />
        )}
      </OperationalResultRegion>
    </>
  );
}

export function ExploreFocusedLogPage({ query, ...common }: CommonProps & { query: LogExploreQuery }) {
  const investigation = useLogInvestigationController(query);
  const state = investigation.state;
  const metricsPath = state.kind === 'ready' ? buildLogInvestigationMetricsPath(query, state.snapshot) : undefined;
  const topologyPath = state.kind === 'ready' ? buildLogInvestigationTopologyPath(state.snapshot) : undefined;
  return (
    <>
      <ExploreWorkbench query={query} t={common.t} updateQuery={common.updateQuery} />
      <OperationalResultRegion>
        {state.kind === 'ready' ? (
          <ExploreLogInvestigationView
            state={state}
            evidenceCurrent
            onBack={() => common.openPath(backToResultsPath(query))}
            onRefresh={() => void investigation.refetch()}
            onFocusTrace={() => common.openPath(logTracePath(query, state.snapshot.selectedLog.log))}
            {...(metricsPath ? { onOpenMetrics: () => common.openPath(metricsPath) } : {})}
            {...(topologyPath ? { onOpenTopology: () => common.openPath(topologyPath) } : {})}
          />
        ) : (
          <InvestigationRequestState state={state.kind} retry={investigation.refetch} t={common.t} />
        )}
      </OperationalResultRegion>
    </>
  );
}

function InvestigationRequestState({
  state,
  retry,
  t
}: {
  state: 'inactive' | 'invalid' | 'loading' | 'unavailable' | 'contract_error';
  retry: () => Promise<void>;
  t: TFunction;
}) {
  if (state === 'loading') return <ExploreLoadingResult />;
  if (state === 'unavailable') {
    return (
      <ExploreMessageResult
        kind="unavailable"
        message={t('exploreInvestigation.query.unavailable')}
        retry={retry}
        retryLabel={t('common.retry')}
      />
    );
  }
  if (state === 'contract_error') {
    return (
      <ExploreMessageResult
        kind="error"
        message={t('exploreInvestigation.query.contract')}
        retry={retry}
        retryLabel={t('common.retry')}
      />
    );
  }
  return null;
}

function backToResultsPath(query: TraceExploreQuery | LogExploreQuery) {
  return buildExplorePath(
    mergeExploreQuery(query, {
      traceId: undefined,
      spanId: undefined,
      logRecordUid: undefined
    })
  );
}

function logTracePath(query: LogExploreQuery, log: InvestigationLogRecord | null) {
  return buildCrossSignalPath(query, 'traces', {
    traceId: log?.traceId ?? undefined,
    spanId: log?.spanId ?? undefined
  });
}
