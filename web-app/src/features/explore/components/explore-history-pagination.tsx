/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Pagination } from 'antd';
import type { TFunction } from 'i18next';

import { buildExplorePath } from '../model/explore-model';
import type { ExplorePageResult } from '../model/explore-signal-contract';
import type { LogExploreQuery, TraceExploreQuery } from '../model/explore-query';
import styles from './explore-history-result.module.css';

export function ExploreHistoryPagination({
  page,
  query,
  enabled,
  openPath,
  t,
  variant = 'default'
}: {
  page: ExplorePageResult<unknown>;
  query: LogExploreQuery | TraceExploreQuery;
  enabled: boolean;
  openPath: (path: string) => void;
  t: TFunction;
  variant?: 'default' | 'compact' | undefined;
}) {
  if (page.totalPages <= 1) return null;
  const openPage = (next: number) => {
    if (enabled) openPath(buildExplorePath({ ...query, pageIndex: next - 1 || undefined }));
  };
  if (variant === 'compact') {
    const current = (query.pageIndex ?? page.number) + 1;
    return (
      <nav
        className={styles.pagination}
        aria-label={`${t('explore.perses.pagination')}: ${t('explore.perses.pageStatus')} ${current.toLocaleString()} / ${page.totalPages.toLocaleString()}`}
        data-pagination-variant="compact"
      >
        <button
          type="button"
          aria-label={t('explore.perses.previousPage')}
          disabled={!enabled || current <= 1}
          onClick={() => openPage(current - 1)}
        >
          <LeftOutlined aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('explore.perses.nextPage')}
          disabled={!enabled || current >= page.totalPages}
          onClick={() => openPage(current + 1)}
        >
          <RightOutlined aria-hidden="true" />
        </button>
      </nav>
    );
  }
  return (
    <nav className={styles.pagination} aria-label={t('explore.perses.pagination')} data-pagination-variant="default">
      <Pagination
        current={page.number + 1}
        pageSize={page.size}
        total={page.totalElements}
        showSizeChanger={false}
        disabled={!enabled}
        onChange={openPage}
      />
    </nav>
  );
}
