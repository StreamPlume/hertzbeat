/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';

import { HertzBeatMetricTimeSeriesResult } from '@/platform/perses';
import type { ExactTimeWindow } from '@/shared/query-context';

import { createLogTrendPersesResult, exploreOverviewRows } from '../model/explore-perses-result-model';
import type { LogHistoryEvidence } from '../model/explore-signal-contract';
import { explorePersesMessages } from './explore-perses-messages';
import styles from './log-result.module.css';

export function ExploreLogStatistics({
  statistics,
  timeWindow,
  runtimeIdentity,
  onTimeWindowChange,
  selectedSeverity,
  onSeverityChange,
  t
}: {
  statistics: Pick<LogHistoryEvidence, 'overview' | 'trend'>;
  timeWindow: ExactTimeWindow;
  runtimeIdentity: string;
  onTimeWindowChange?: ((window: ExactTimeWindow) => void) | undefined;
  selectedSeverity?: string | undefined;
  onSeverityChange?: ((severity: string | undefined) => void) | undefined;
  t: TFunction;
}) {
  return (
    <div className={styles.statistics}>
      <Overview statistics={statistics} selectedSeverity={selectedSeverity} onSeverityChange={onSeverityChange} t={t} />
      <Trend
        statistics={statistics}
        timeWindow={timeWindow}
        runtimeIdentity={runtimeIdentity}
        onTimeWindowChange={onTimeWindowChange}
        t={t}
      />
    </div>
  );
}

function Overview({
  statistics,
  selectedSeverity,
  onSeverityChange,
  t
}: {
  statistics: Pick<LogHistoryEvidence, 'overview'>;
  selectedSeverity?: string | undefined;
  onSeverityChange?: ((severity: string | undefined) => void) | undefined;
  t: TFunction;
}) {
  return (
    <section className={styles.overview} aria-label={t('exploreLog.overview')} data-explore-evidence-summary="">
      {statistics.overview.kind === 'error' ? (
        <span className={styles.evidenceState} role="alert">
          {t('exploreLog.statisticsUnavailable')}
        </span>
      ) : (
        <dl className={styles.overviewStats}>
          {exploreOverviewRows(statistics.overview.data).map(([key, value]) => {
            const label = t(`exploreLog.statistics.${key}`);
            if (key === 'trace') {
              return (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{value.toLocaleString()}</dd>
                </div>
              );
            }
            const severity = key === 'total' ? undefined : key.toUpperCase();
            const active = key === 'total' ? selectedSeverity == null : selectedSeverity?.toUpperCase() === severity;
            return (
              <div key={key}>
                <button
                  type="button"
                  aria-label={`${label} ${value.toLocaleString()}`}
                  aria-pressed={active}
                  disabled={onSeverityChange == null}
                  onClick={() => onSeverityChange?.(severity)}
                >
                  <span>{label}</span>
                  <strong>{value.toLocaleString()}</strong>
                </button>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

function Trend({
  statistics,
  timeWindow,
  runtimeIdentity,
  onTimeWindowChange,
  t
}: {
  statistics: Pick<LogHistoryEvidence, 'trend'>;
  timeWindow: ExactTimeWindow;
  runtimeIdentity: string;
  onTimeWindowChange?: ((window: ExactTimeWindow) => void) | undefined;
  t: TFunction;
}) {
  const rows = statistics.trend.kind === 'ready' ? statistics.trend.data.buckets : [];
  const singleBucketCount =
    statistics.trend.kind === 'ready' && rows.length === 1 ? statistics.trend.data.buckets[0]?.count : undefined;
  const density = rows.length > 0 && statistics.trend.kind === 'ready' ? 'visualization' : 'compact';
  const evidenceState = trendEvidenceState(statistics.trend, rows.length, singleBucketCount, t);
  return (
    <section className={styles.trend} aria-label={t('exploreLog.trend')} data-trend-density={density}>
      <header className={styles.trendHeader}>
        <h3>{t('exploreLog.trend')}</h3>
        {evidenceState}
      </header>
      {statistics.trend.kind === 'ready' && rows.length > 0 ? (
        <TrendResult
          trend={statistics.trend.data}
          timeWindow={timeWindow}
          runtimeIdentity={runtimeIdentity}
          onTimeWindowChange={onTimeWindowChange}
          t={t}
        />
      ) : null}
    </section>
  );
}

function trendEvidenceState(
  trend: LogHistoryEvidence['trend'],
  rowCount: number,
  singleBucketCount: number | undefined,
  t: TFunction
): ReactNode {
  if (trend.kind === 'error') {
    return (
      <span className={styles.evidenceState} role="alert">
        {t('exploreLog.statisticsUnavailable')}
      </span>
    );
  }
  if (rowCount === 0) return <span className={styles.evidenceState}>{t('exploreLog.trendEmpty')}</span>;
  if (rowCount === 1) {
    return (
      <span className={styles.evidenceState}>{t('exploreLog.trendInsufficient', { count: singleBucketCount })}</span>
    );
  }
  return null;
}

function TrendResult({
  trend,
  timeWindow,
  runtimeIdentity,
  onTimeWindowChange,
  t
}: {
  trend: Extract<LogHistoryEvidence['trend'], { kind: 'ready' }>['data'];
  timeWindow: ExactTimeWindow;
  runtimeIdentity: string;
  onTimeWindowChange?: ((window: ExactTimeWindow) => void) | undefined;
  t: TFunction;
}) {
  const result = createLogTrendPersesResult(trend, timeWindow, runtimeIdentity);
  return (
    <HertzBeatMetricTimeSeriesResult
      className={styles.trendChart}
      title={t('exploreLog.trend')}
      ariaLabel={t('exploreLog.trend')}
      query={result.query}
      outcome={result.outcome}
      runtimeIdentity={result.runtimeIdentity}
      messages={explorePersesMessages(t)}
      timeSeriesDisplay="bar"
      onTimeWindowChange={onTimeWindowChange}
      timeWindowChangeEnabled={onTimeWindowChange != null}
      variant="compact"
    />
  );
}
