/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { HertzBeatLogsTableResult, orderHertzBeatLogRowsForPerses } from '@/platform/perses';
import { usePublishShellInvestigation } from '@/shared/investigation';
import type { ExactTimeWindow } from '@/shared/query-context';

import historyStyles from '../components/explore-history-result.module.css';
import { useLogDisplayPreferences } from '../components/explore-log-display-preferences';
import { ExploreLogResultToolbar } from '../components/explore-log-result-toolbar';
import { ExploreLogInspector } from '../components/explore-log-inspector';
import { ExploreLogStatistics } from '../components/explore-log-statistics';
import { explorePersesMessages } from '../components/explore-perses-messages';
import { ExploreMessageResult, ExploreResultFrame } from '../components/explore-state-panel';
import { SignalEmptyState, SignalResultFrame } from '../components/signal-result-frame';
import { materializeLogInvestigation } from '../model/explore-agent-handoff';
import { buildLogInvestigationPath, buildTraceInvestigationPath } from '../model/explore-investigation-model';
import { createExploreLogPersesResult } from '../model/explore-perses-result-model';
import { buildExplorePath, logTrendZoomPatch, mergeExploreQuery, type LogExploreQuery } from '../model/explore-model';
import type { LogHistoryEvidence, LogRow } from '../model/explore-signal-contract';
import { logBody, logTimestampMs } from '../model/explore-signal-model';

type Props = {
  data: LogHistoryEvidence['page'];
  statistics: Pick<LogHistoryEvidence, 'overview' | 'trend'>;
  query: LogExploreQuery;
  openPath: (path: string) => void;
  timeWindow: ExactTimeWindow | undefined;
  revision: number;
  evidenceCurrent: boolean;
};

export function ExplorePersesLogPanel(props: Props) {
  const { data, statistics, query, openPath, timeWindow, revision, evidenceCurrent } = props;
  const { t } = useTranslation();
  const [logDisplay, setLogDisplay] = useLogDisplayPreferences();
  const evidence = useMemo(() => currentLogEvidence(data, evidenceCurrent), [data, evidenceCurrent]);
  usePublishShellInvestigation(
    useMemo(() => materializeLogInvestigation(query, evidence, timeWindow), [evidence, query, timeWindow])
  );
  if (!timeWindow) return <ExploreMessageResult kind="error" message={t('explore.states.contractError')} />;
  const result = createExploreLogPersesResult(query, data, timeWindow, revision);
  const onTrendTimeWindowChange = evidenceCurrent
    ? (nextWindow: ExactTimeWindow) => openLogTrendZoom(query, timeWindow, nextWindow, openPath)
    : undefined;
  const statisticsView = (
    <ExploreLogStatistics
      statistics={statistics}
      timeWindow={timeWindow}
      runtimeIdentity={result.runtimeIdentity}
      onTimeWindowChange={onTrendTimeWindowChange}
      selectedSeverity={query.severityText}
      onSeverityChange={
        evidenceCurrent
          ? severityText => openPath(buildExplorePath(mergeExploreQuery(query, { severityText, pageIndex: undefined })))
          : undefined
      }
      t={t}
    />
  );
  const resultView = (
    <SignalResultFrame
      title={t('explore.signals.logs')}
      count={data.totalElements}
      actions={
        <ExploreLogResultToolbar
          page={data}
          query={query}
          timeWindow={timeWindow}
          evidenceCurrent={evidenceCurrent}
          preferences={logDisplay}
          onPreferencesChange={setLogDisplay}
          openPath={openPath}
          t={t}
        />
      }
    >
      {data.totalElements === 0 ? (
        <SignalEmptyState title={t('explore.empty.logs')} hint={t('explore.description')} />
      ) : (
        <SelectablePersesLogTable
          rows={data.content}
          query={query}
          timeWindow={timeWindow}
          runtimeIdentity={result.runtimeIdentity}
          persesQuery={result.query}
          persesOutcome={result.outcome}
          logDisplay={logDisplay}
          evidenceCurrent={evidenceCurrent}
          openPath={openPath}
        />
      )}
    </SignalResultFrame>
  );
  if (!evidenceCurrent || data.totalElements === 0) {
    return (
      <ExploreResultFrame>
        {statisticsView}
        {resultView}
      </ExploreResultFrame>
    );
  }
  return (
    <>
      <section className={historyStyles.logRegion} data-explore-log-region="trend">
        {statisticsView}
      </section>
      <section className={historyStyles.logRegion} data-explore-log-region="result">
        {resultView}
      </section>
    </>
  );
}

function SelectablePersesLogTable({
  rows,
  query,
  timeWindow,
  runtimeIdentity,
  persesQuery,
  persesOutcome,
  logDisplay,
  evidenceCurrent,
  openPath
}: {
  rows: LogRow[];
  query: LogExploreQuery;
  timeWindow: ExactTimeWindow;
  runtimeIdentity: string;
  persesQuery: ReturnType<typeof createExploreLogPersesResult>['query'];
  persesOutcome: ReturnType<typeof createExploreLogPersesResult>['outcome'];
  logDisplay: Parameters<typeof HertzBeatLogsTableResult>[0]['logDisplay'];
  evidenceCurrent: boolean;
  openPath: (path: string) => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const orderedRows = useMemo(() => orderHertzBeatLogRowsForPerses(rows), [rows]);
  const [selection, setSelection] = useState<{ identity: string; index: number }>();
  const selectedIndex = selection?.identity === runtimeIdentity && evidenceCurrent ? selection.index : undefined;
  const selectedRow = selectedIndex == null ? undefined : orderedRows[selectedIndex];
  const inspectorId = 'explore-log-inspector';
  const selectRow = useCallback(
    (index: number) => {
      if (evidenceCurrent && orderedRows[index]) setSelection({ identity: runtimeIdentity, index });
    },
    [evidenceCurrent, orderedRows, runtimeIdentity]
  );
  const closeInspector = useCallback(() => {
    const trigger = hostRef.current?.querySelector<HTMLElement>(`[data-log-index="${selectedIndex ?? -1}"]`);
    setSelection(undefined);
    queueMicrotask(() => trigger?.focus());
  }, [selectedIndex]);
  return (
    <div ref={hostRef} className={historyStyles.logResultBody} data-log-inspector-open={selectedRow ? 'true' : 'false'}>
      <HertzBeatLogsTableResult
        title={t('explore.signals.logs')}
        ariaLabel={t('explore.perses.logsTable')}
        query={persesQuery}
        outcome={persesOutcome}
        runtimeIdentity={runtimeIdentity}
        logDisplay={logDisplay}
        logRowSelection={{
          ariaLabel: t('explore.perses.logsTable'),
          controlsId: inspectorId,
          selectedIndex,
          getAriaLabel: index => {
            const row = orderedRows[index];
            return row ? logInteractionLabel(row, t) : t('explore.perses.logsTable');
          },
          getSeverityLabel: index => orderedRows[index]?.severityText ?? undefined,
          onSelect: selectRow
        }}
        messages={explorePersesMessages(t)}
      />
      {selectedRow && (
        <ExploreLogInspector
          id={inspectorId}
          row={selectedRow}
          selectedIndex={selectedIndex!}
          rowCount={orderedRows.length}
          evidenceCurrent={evidenceCurrent}
          onSelectIndex={selectRow}
          onInvestigate={investigateAction(selectedRow, query, timeWindow, openPath)}
          onOpenTrace={traceAction(selectedRow, query, timeWindow, openPath)}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}

function investigateAction(
  row: LogRow,
  query: LogExploreQuery,
  window: ExactTimeWindow,
  openPath: (path: string) => void
) {
  return validLogRecordUid(row.logRecordUid)
    ? () => openPath(buildLogInvestigationPath(query, selectedLog(row), window, browserTimeZone()))
    : undefined;
}

function traceAction(row: LogRow, query: LogExploreQuery, window: ExactTimeWindow, openPath: (path: string) => void) {
  return validTraceId(row.traceId)
    ? () => openPath(buildTraceInvestigationPath(query, selectedTrace(row), window, browserTimeZone()))
    : undefined;
}

function openLogTrendZoom(
  query: LogExploreQuery,
  evidenceWindow: ExactTimeWindow,
  requestedWindow: ExactTimeWindow,
  openPath: (path: string) => void
) {
  const patch = logTrendZoomPatch(query, evidenceWindow, requestedWindow);
  if (patch) openPath(buildExplorePath(mergeExploreQuery(query, patch)));
}

function currentLogEvidence(data: LogHistoryEvidence['page'], current: boolean) {
  return current
    ? { totalElements: data.totalElements, number: data.number, size: data.size, contentCount: data.content.length }
    : undefined;
}

function selectedLog(row: LogRow) {
  return { logRecordUid: row.logRecordUid!, timeUnixNano: row.timeUnixNano, traceId: row.traceId, spanId: row.spanId };
}

function selectedTrace(row: LogRow) {
  return { traceId: row.traceId!, selectedSpanId: row.spanId, startTime: null, durationNanos: null };
}

function logInteractionLabel(row: LogRow, t: ReturnType<typeof useTranslation>['t']) {
  const timestamp = logTimestampMs(row);
  const time = timestamp ? new Date(timestamp).toLocaleString() : t('explore.perses.notRecorded');
  return `${time} · ${boundedInteractionSummary(logBody(row) ?? t('explore.perses.notRecorded'))}`;
}

function validLogRecordUid(value: string | null): value is string {
  return value != null && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function boundedInteractionSummary(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 79)}…`;
}

function validTraceId(value: string | null): value is string {
  return value != null && /^[0-9a-f]{32}$/u.test(value);
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
