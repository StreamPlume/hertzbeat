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

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';
import { QUERY_CONTEXT_FIELDS } from '@/shared/query-context';

import { ExploreActiveFilters } from './explore-active-filters';
import type { ExploreQuery } from '../model/explore-model';

describe('Explore active filters', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });

  afterEach(cleanup);

  it('delegates draft-owned removal without applying the query fallback', () => {
    const removeFilter = vi.fn(() => true);
    const updateQuery = vi.fn();
    render(
      <ExploreActiveFilters
        query={{
          signal: 'logs',
          timeRange: 'last-30m',
          instance: 'checkout-7d9',
          severityText: 'ERROR'
        }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );

    expect(screen.getByText('Severity: ERROR')).toBeInTheDocument();
    closeFilter('Instance: checkout-7d9');

    expect(removeFilter).toHaveBeenCalledWith(QUERY_CONTEXT_FIELDS.instance);
    expect(updateQuery).not.toHaveBeenCalled();
  });

  it('falls back to query removal for a filter outside the submission draft', () => {
    const removeFilter = vi.fn(() => false);
    const updateQuery = vi.fn();
    render(
      <ExploreActiveFilters
        query={{ signal: 'metrics', timeRange: 'last-30m', serviceNamespace: 'commerce' }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );

    closeFilter('Namespace: commerce');

    expect(removeFilter).toHaveBeenCalledWith('serviceNamespace');
    expect(updateQuery).toHaveBeenCalledWith({ serviceNamespace: undefined });
  });

  it('shows and independently removes the metrics operation context', () => {
    const removeFilter = vi.fn(() => false);
    const updateQuery = vi.fn();
    render(
      <ExploreActiveFilters
        query={{
          signal: 'metrics',
          timeRange: 'last-30m',
          serviceName: 'checkout',
          operationName: 'POST /checkout'
        }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );

    expect(screen.getByText('Operation: POST /checkout')).toBeInTheDocument();
    closeFilter('Operation: POST /checkout');
    expect(removeFilter).toHaveBeenCalledWith('operationName');
    expect(updateQuery).toHaveBeenCalledWith({ operationName: undefined });
    expect(screen.getByText('Service: checkout')).toBeInTheDocument();
  });

  it('shows signal-specific parity filters and delegates their removal', () => {
    const removeFilter = vi.fn(() => true);
    const updateQuery = vi.fn();
    const { rerender } = render(
      <ExploreActiveFilters
        query={{ signal: 'metrics', timeRange: 'last-30m', temporalAggregation: 'rate' }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );
    expect(screen.getByText('Temporal aggregation: Rate per second')).toBeInTheDocument();

    rerender(
      <ExploreActiveFilters
        query={{ signal: 'traces', timeRange: 'last-30m', spanScope: 'root', hideInternal: true }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );
    expect(screen.getByText('Span scope: Root spans')).toBeInTheDocument();
    expect(screen.getByText('Hide internal spans')).toBeInTheDocument();

    rerender(
      <ExploreActiveFilters
        query={{ signal: 'logs', timeRange: 'last-30m', hideInternal: true, hideNoise: true }}
        t={i18n.t}
        updateQuery={updateQuery}
        removeFilter={removeFilter}
      />
    );
    expect(screen.getByText('Hide internal logs')).toBeInTheDocument();
    closeFilter('Hide noise logs');
    expect(removeFilter).toHaveBeenCalledWith('hideNoise');
    expect(updateQuery).not.toHaveBeenCalled();
  });

  it.each([
    [
      'metric label filter',
      { signal: 'metrics', timeRange: 'last-30m', metricFilter: 'method=GET' },
      'Label filter, key=value: method=GET',
      'metricFilter'
    ],
    [
      'metric group by',
      { signal: 'metrics', timeRange: 'last-30m', groupBy: 'service.name' },
      'Group by label: service.name',
      'groupBy'
    ],
    [
      'metric aggregation',
      { signal: 'metrics', timeRange: 'last-30m', aggregation: 'sum' },
      'Aggregation: sum',
      'aggregation'
    ],
    [
      'metric step',
      { signal: 'metrics', timeRange: 'last-30m', step: '60' },
      'Step in seconds, for example 60: 60',
      'step'
    ],
    [
      'log resource filter',
      { signal: 'logs', timeRange: 'last-30m', resourceFilter: 'service.name=checkout' },
      'Resource attributes, key=value: service.name=checkout',
      'resourceFilter'
    ],
    [
      'log attribute filter',
      { signal: 'logs', timeRange: 'last-30m', attributeFilter: 'http.status_code:500' },
      'Log attributes, key:value: http.status_code:500',
      'attributeFilter'
    ],
    [
      'trace resource filter',
      { signal: 'traces', timeRange: 'last-30m', resourceFilter: 'service.name=checkout' },
      'Resource attributes, key=value: service.name=checkout',
      'resourceFilter'
    ],
    [
      'trace attribute filter',
      { signal: 'traces', timeRange: 'last-30m', attributeFilter: 'http.route:/checkout' },
      'Trace attributes, key:value: http.route:/checkout',
      'attributeFilter'
    ],
    [
      'trace minimum duration',
      { signal: 'traces', timeRange: 'last-30m', minDurationMs: 25 },
      'Minimum duration (ms): 25',
      'minDurationMs'
    ],
    [
      'trace maximum duration',
      { signal: 'traces', timeRange: 'last-30m', maxDurationMs: 800 },
      'Maximum duration (ms): 800',
      'maxDurationMs'
    ]
  ] as const)('shows and removes the applied %s chip', (_name, query, label, key) => {
    const removeFilter = vi.fn(() => true);
    render(
      <ExploreActiveFilters
        query={query as ExploreQuery}
        t={i18n.t}
        updateQuery={vi.fn()}
        removeFilter={removeFilter}
      />
    );

    closeFilter(label);
    expect(removeFilter).toHaveBeenCalledWith(key);
  });
});

function closeFilter(label: string) {
  const tag = screen.getByText(label).closest('.ant-tag');
  expect(tag).not.toBeNull();
  fireEvent.click(within(tag as HTMLElement).getByRole('img', { name: 'Close' }));
}
