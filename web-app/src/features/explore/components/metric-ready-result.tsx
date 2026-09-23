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

import { Table, Tag } from 'antd';
import type { TFunction } from 'i18next';

import { HertzBeatMetricTimeSeriesResult } from '@/platform/perses';
import type { ExactTimeWindow } from '@/shared/query-context';

import { createExploreMetricPersesResult } from '../model/explore-perses-result-model';
import type { MetricExploreQuery } from '../model/explore-query';
import type { MetricConsole } from '../model/explore-signal-contract';
import { metricPoints, type MetricSeries } from '../model/explore-signal-model';
import { explorePersesMessages } from './explore-perses-messages';
import { SignalResultFrame } from './signal-result-frame';

const METRIC_SAMPLE_LIMIT = 100;
const METRIC_TABLE_SCROLL = { x: 760, y: 320 };
const METRIC_NAME_LABEL = '__name__';

type SampleRow = {
  key: string;
  seriesKey: string;
  seriesName: string;
  timestamp: number;
  value: number;
  unit?: string | undefined;
};

export function MetricReadyResult({
  data,
  series,
  query,
  timeWindow,
  revision,
  t
}: {
  data: MetricConsole;
  series: MetricSeries[];
  query: MetricExploreQuery;
  timeWindow: ExactTimeWindow;
  revision: number;
  t: TFunction;
}) {
  const samples = buildSampleRows(series);
  const result = createExploreMetricPersesResult(query, data, timeWindow, revision, series);
  return (
    <SignalResultFrame
      title={t('explore.signals.metrics')}
      count={data.stats?.totalSeries ?? series.length}
      unit={t('exploreMetric.series')}
      meta={[
        { label: t('explore.samples'), value: samples.length },
        { label: t('exploreMetric.datasource'), value: data.datasource ?? '—' },
        { label: t('exploreMetric.queryMode'), value: data.queryMode ?? '—' }
      ]}
    >
      <HertzBeatMetricTimeSeriesResult
        title={t('explore.signals.metrics')}
        ariaLabel={t('exploreMetric.trend')}
        query={result.query}
        outcome={result.outcome}
        runtimeIdentity={result.runtimeIdentity}
        messages={explorePersesMessages(t)}
      />
      <MetricSampleTable series={series} samples={samples} t={t} />
    </SignalResultFrame>
  );
}

function MetricSampleTable({ series, samples, t }: { series: MetricSeries[]; samples: SampleRow[]; t: TFunction }) {
  return (
    <Table<SampleRow>
      rowKey="key"
      size="small"
      dataSource={samples.slice(-METRIC_SAMPLE_LIMIT).reverse()}
      pagination={false}
      scroll={METRIC_TABLE_SCROLL}
      columns={[
        {
          title: t('explore.time'),
          dataIndex: 'timestamp',
          render: (value: number) => new Date(value).toLocaleString()
        },
        { title: t('explore.metric'), dataIndex: 'seriesName' },
        {
          title: t('exploreMetric.value'),
          dataIndex: 'value',
          render: (value, row) => `${String(value)}${row.unit ? ` ${row.unit}` : ''}`
        },
        {
          title: t('explore.labels'),
          render: (_, row) => <MetricLabels series={series} seriesKey={row.seriesKey} />
        }
      ]}
    />
  );
}

function MetricLabels({ series, seriesKey }: { series: MetricSeries[]; seriesKey: string }) {
  const item = series.find(candidate => candidate.key === seriesKey);
  if (!item) return '—';
  return Object.entries(item.labels)
    .filter(([key]) => key !== METRIC_NAME_LABEL)
    .map(([key, value]) => (
      <Tag key={key}>
        {key}={value}
      </Tag>
    ));
}

function buildSampleRows(series: MetricSeries[]): SampleRow[] {
  return series.flatMap(item =>
    metricPoints(item).map((point, index) => ({
      key: `${item.key}-${point.timestamp}-${index}`,
      seriesKey: item.key,
      seriesName: item.name,
      timestamp: point.timestamp,
      value: point.value,
      unit: item.unit
    }))
  );
}
