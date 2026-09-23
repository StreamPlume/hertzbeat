/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Button, Input, Radio, Select } from 'antd';
import type { TFunction } from 'i18next';
import { useState, type ReactNode } from 'react';

import { OperationalCommandBar } from '@/shared/operational-page';
import { globalAutoRefreshValues, type SharedTimeValue } from '@/shared/time';

import {
  EXPLORE_TIME_RANGES,
  exploreUsesExactWindow,
  presetTimeRangePatch,
  type ExploreQuery,
  type ExploreQueryPatch,
  type ExploreTimeRange
} from '../model/explore-model';
import type { ExploreSubmissionViewModel } from '../model/explore-submission-model';
import { parseLogFilterExpression } from '../model/explore-log-filter-expression';
import { ExploreActiveFilters } from './explore-active-filters';
import { ExploreAdvancedFilters, ExploreGuidedFilters } from './explore-advanced-filters';
import { ExploreLogQueryBuilder, type LogQueryEditorMode } from './explore-log-query-builder';
import styles from './explore-query-bar.module.css';

type Props = {
  query: ExploreQuery;
  t: TFunction;
  updateQuery: (changes: ExploreQueryPatch) => void;
  updateScope: (changes: ExploreQueryPatch) => void;
  refresh: () => Promise<void>;
  time: SharedTimeValue | null | undefined;
  submission: ExploreSubmissionViewModel;
};

const EXACT_WINDOW_OPTION = 'exact-window';
export const LOG_QUERY_EDITOR_MODE_STORAGE_KEY = 'hertzbeat.explore.logs.query-mode';

export function ExploreQueryBar({ query, t, updateQuery, updateScope, refresh, time, submission }: Props) {
  const { draft, errors, updateField } = submission;
  const [logEditorPreference, setLogEditorPreference] = useState<LogQueryEditorMode>(readLogEditorPreference);
  const logFiltersAreLossless =
    draft.signal !== 'logs' ||
    (parseLogFilterExpression(draft.resourceFilter).valid && parseLogFilterExpression(draft.attributeFilter).valid);
  const logEditorMode: LogQueryEditorMode = logFiltersAreLossless ? logEditorPreference : 'code';

  return (
    <form
      className={styles.form}
      aria-label={t('explore.queryToolbar')}
      onSubmit={event => {
        event.preventDefault();
        submission.submit();
      }}
    >
      <OperationalCommandBar
        primary={
          query.signal === 'logs' && draft.signal === 'logs' ? (
            <div className={styles.logCommandFields}>
              <ToolbarField label={t('explore.logQueryBuilder.editor')}>
                <div className={styles.logMode} aria-label={t('explore.logQueryBuilder.editor')} role="radiogroup">
                  <Radio.Group
                    name="log-query-editor"
                    value={logEditorMode}
                    onChange={event => {
                      const mode = event.target.value as LogQueryEditorMode;
                      if (mode === 'builder' && !logFiltersAreLossless) return;
                      setLogEditorPreference(mode);
                      writeLogEditorPreference(mode);
                    }}
                  >
                    <Radio.Button value="builder" disabled={!logFiltersAreLossless}>
                      {t('explore.logQueryBuilder.builder')}
                    </Radio.Button>
                    <Radio.Button value="code">{t('explore.logQueryBuilder.code')}</Radio.Button>
                  </Radio.Group>
                </div>
              </ToolbarField>
              <ToolbarField label={t('explore.timeRange')}>
                <ExploreTimeRange query={query} t={t} updateScope={updateScope} />
              </ToolbarField>
              <ToolbarField className={styles.queryInput ?? ''} label={t('explore.logQueryBuilder.messageSearch')}>
                <Input
                  value={draft.query}
                  aria-label={t(`explore.queryLabels.${query.signal}`)}
                  onChange={event => updateField({ field: 'query', value: event.target.value })}
                  placeholder={t(`explore.queryPlaceholders.${query.signal}`)}
                />
              </ToolbarField>
              <ToolbarField label={t('exploreLog.mode')}>
                <ExploreLogMode query={query} t={t} updateScope={updateScope} />
              </ToolbarField>
            </div>
          ) : (
            <div className={styles.commandFields}>
              <ExploreTimeRange query={query} t={t} updateScope={updateScope} />
              <Input
                className={styles.queryInput ?? ''}
                value={draft.query}
                aria-label={t(`explore.queryLabels.${query.signal}`)}
                onChange={event => updateField({ field: 'query', value: event.target.value })}
                placeholder={t(`explore.queryPlaceholders.${query.signal}`)}
              />
              <ExploreAutoRefresh query={query} t={t} time={time} />
            </div>
          )
        }
        secondary={
          <div className={styles.commandActions}>
            <Button className={styles.run ?? ''} type="primary" htmlType="submit">
              {t('common.query')}
            </Button>
            <Button type="text" onClick={() => void refresh()}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />
      {draft.signal === 'logs' ? (
        <ExploreLogQueryBuilder draft={draft} mode={logEditorMode} t={t} updateField={updateField} />
      ) : (
        <>
          <ExploreGuidedFilters draft={draft} t={t} updateField={updateField} />
          <ExploreAdvancedFilters draft={draft} errors={errors} t={t} updateField={updateField} />
        </>
      )}
      <ExploreActiveFilters query={query} t={t} updateQuery={updateQuery} removeFilter={submission.removeFilter} />
    </form>
  );
}

function ToolbarField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={[styles.toolbarField, className].filter(Boolean).join(' ')}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function ExploreLogMode({ query, t, updateScope }: Pick<Props, 'query' | 't' | 'updateScope'>) {
  const live = query.signal === 'logs' && Boolean(query.live);
  return (
    <div className={styles.logMode} aria-label={t('exploreLog.mode')} role="radiogroup">
      <Radio.Group
        name="log-mode"
        value={live ? 'live' : 'history'}
        onChange={event => updateScope(event.target.value === 'live' ? { live: true } : { live: undefined })}
      >
        <Radio.Button value="history">{t('exploreLog.history')}</Radio.Button>
        <Radio.Button value="live">{t('exploreLog.live')}</Radio.Button>
      </Radio.Group>
    </div>
  );
}

function ExploreTimeRange({ query, t, updateScope }: Pick<Props, 'query' | 't' | 'updateScope'>) {
  const exactWindow = exploreUsesExactWindow(query);
  const exactOption = exactWindow
    ? [{ value: EXACT_WINDOW_OPTION, label: t('explore.exactWindow'), disabled: true }]
    : [];
  return (
    <Select<string>
      className={styles.timeRange ?? ''}
      aria-label={t('explore.timeRange')}
      value={exactWindow ? EXACT_WINDOW_OPTION : query.timeRange}
      options={[
        ...exactOption,
        ...EXPLORE_TIME_RANGES.map(value => ({ value, label: t(`explore.timeRanges.${value}`) }))
      ]}
      onChange={value => updateTimeRange(query, value, updateScope)}
    />
  );
}

function ExploreAutoRefresh({ query, t, time }: Pick<Props, 'query' | 't' | 'time'>) {
  const fixedWindowFields = query.start != null || query.end != null;
  if (fixedWindowFields || !time) return null;
  return (
    <Select<number>
      className={styles.timeRange ?? ''}
      aria-label={autoRefreshLabel(time.autoRefreshMs, t)}
      value={time.autoRefreshMs}
      options={globalAutoRefreshValues.map(interval => ({ value: interval, label: autoRefreshLabel(interval, t) }))}
      onChange={interval => time.setAutoRefresh(interval)}
    />
  );
}

function updateTimeRange(query: ExploreQuery, value: string, updateScope: Props['updateScope']) {
  if (!EXPLORE_TIME_RANGES.includes(value as ExploreTimeRange)) return;
  updateScope(presetTimeRangePatch(query, value as ExploreTimeRange));
}

function autoRefreshLabel(interval: number, t: TFunction) {
  if (interval === 0) return t('shell.time.autoRefreshOff');
  return t('shell.time.autoRefreshSeconds', { seconds: interval / 1_000 });
}

function readLogEditorPreference(): LogQueryEditorMode {
  try {
    return globalThis.localStorage?.getItem(LOG_QUERY_EDITOR_MODE_STORAGE_KEY) === 'code' ? 'code' : 'builder';
  } catch {
    return 'builder';
  }
}

function writeLogEditorPreference(mode: LogQueryEditorMode) {
  try {
    globalThis.localStorage?.setItem(LOG_QUERY_EDITOR_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in restricted browser contexts; the in-memory preference still works.
  }
}
