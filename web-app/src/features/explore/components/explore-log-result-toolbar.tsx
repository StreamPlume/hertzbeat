/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type { TFunction } from 'i18next';

import type { ExactTimeWindow } from '@/shared/query-context';

import type { LogExploreQuery } from '../model/explore-query';
import type { LogHistoryEvidence } from '../model/explore-signal-contract';
import type { ExploreLogDisplayPreferences } from './explore-log-display-preferences';
import { ExploreHistoryPagination } from './explore-history-pagination';
import styles from './explore-log-result-toolbar.module.css';

export function ExploreLogResultToolbar({
  page,
  query,
  timeWindow,
  evidenceCurrent,
  preferences,
  onPreferencesChange,
  openPath,
  t
}: {
  page: LogHistoryEvidence['page'];
  query: LogExploreQuery;
  timeWindow: ExactTimeWindow;
  evidenceCurrent: boolean;
  preferences: ExploreLogDisplayPreferences;
  onPreferencesChange: (preferences: ExploreLogDisplayPreferences) => void;
  openPath: (path: string) => void;
  t: TFunction;
}) {
  const exactWindow = `${new Date(timeWindow.from).toISOString()} – ${new Date(timeWindow.to).toISOString()}`;
  const currentPage = page.totalPages === 0 ? 0 : (query.pageIndex ?? page.number) + 1;
  return (
    <div className={styles.toolbar} role="group" aria-label={t('explore.perses.resultToolbar')}>
      <dl className={styles.status}>
        <Status
          label={t('explore.perses.returnedStatus')}
          value={`${page.content.length.toLocaleString()} / ${page.totalElements.toLocaleString()}`}
        />
        <Status
          label={t('explore.perses.pageStatus')}
          value={`${currentPage.toLocaleString()} / ${page.totalPages.toLocaleString()}`}
        />
        <Status
          label={t('explore.perses.windowStatus')}
          value={compactEvidenceWindow(timeWindow)}
          title={exactWindow}
        />
        <Status label={t('explore.perses.provenance')} value={t('explore.perses.historicalEvidence')} />
      </dl>
      <div className={styles.preferences} role="group" aria-label={t('explore.perses.displayPreferences')}>
        <PreferenceButton
          label={t('explore.perses.compactRows')}
          pressed={preferences.density === 'compact'}
          onClick={() =>
            onPreferencesChange({
              ...preferences,
              density: preferences.density === 'compact' ? 'comfortable' : 'compact'
            })
          }
        />
        <PreferenceButton
          label={t('explore.perses.wrapMessages')}
          pressed={preferences.wrap}
          onClick={() => onPreferencesChange({ ...preferences, wrap: !preferences.wrap })}
        />
        <PreferenceButton
          label={t('explore.perses.showTime')}
          pressed={preferences.showTime}
          onClick={() => onPreferencesChange({ ...preferences, showTime: !preferences.showTime })}
        />
      </div>
      <ExploreHistoryPagination
        page={page}
        query={query}
        enabled={evidenceCurrent}
        openPath={openPath}
        t={t}
        variant="compact"
      />
    </div>
  );
}

function Status({ label, value, title }: { label: string; value: string; title?: string | undefined }) {
  return (
    <div aria-label={`${label}: ${title ?? value}`} title={title ?? label}>
      <dt>{label}</dt>
      <dd>{title ? <span aria-label={title}>{value}</span> : value}</dd>
    </div>
  );
}

function PreferenceButton({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}>
      {label}
    </button>
  );
}

function compactEvidenceWindow(window: ExactTimeWindow) {
  const from = new Date(window.from).toISOString();
  const to = new Date(window.to).toISOString();
  if (from.slice(0, 10) === to.slice(0, 10)) return `${from.slice(11, 19)}–${to.slice(11, 19)} UTC`;
  return `${from.slice(0, 16).replace('T', ' ')}–${to.slice(0, 16).replace('T', ' ')} UTC`;
}
