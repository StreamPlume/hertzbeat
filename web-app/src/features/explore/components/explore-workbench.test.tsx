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
import { I18nextProvider, useTranslation } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';
import en from '@/assets/i18n/en-us.json';

import { ExploreQueryBar, LOG_QUERY_EDITOR_MODE_STORAGE_KEY } from './explore-query-bar';
import { ExploreWorkbench } from './explore-workbench';
import historyStylesSource from './explore-history-result.module.css?raw';
import logQueryBuilderStylesSource from './explore-log-query-builder.module.css?raw';
import queryStylesSource from './explore-query-bar.module.css?raw';
import workbenchStylesSource from './explore-workbench.module.css?raw';
import type { ExploreQueryPatch } from '../model/explore-model';
import { draftFromQuery } from '../model/explore-submission-model';
import type { SharedTimeValue } from '@/shared/time';

describe('Explore workbench', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('keeps one accessible query command region with query, time, refresh, and Run controls', () => {
    const updateQuery = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <WorkbenchSubject updateQuery={updateQuery} />
      </I18nextProvider>
    );

    const command = screen.getByRole('form', { name: 'Explore query controls' });
    expect(within(command).getByRole('textbox', { name: 'Metrics query' })).toBeInTheDocument();
    expect(within(command).getByRole('combobox', { name: 'Time range' })).toBeInTheDocument();
    expect(within(command).getByRole('combobox', { name: /Auto refresh/u })).toBeInTheDocument();
    expect(within(command).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(within(command).getByRole('button', { name: 'Query' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).not.toContainElement(
      document.querySelector('[data-hb-operational-page-actions]')
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Metrics' }));
    expect(updateQuery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Logs' }));
    expect(updateQuery).toHaveBeenCalledWith({
      signal: 'logs',
      query: undefined,
      live: undefined,
      pageIndex: undefined
    });
  });

  it('keeps Builder or Code as a local preference and forces exact unparseable URL filters into Code', () => {
    const first = render(
      <I18nextProvider i18n={i18n}>
        <QuerySubject />
      </I18nextProvider>
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Code' }));
    expect(localStorage.getItem(LOG_QUERY_EDITOR_MODE_STORAGE_KEY)).toBe('code');
    first.unmount();

    const persisted = render(
      <I18nextProvider i18n={i18n}>
        <QuerySubject />
      </I18nextProvider>
    );
    expect(screen.getByRole('radio', { name: 'Code' })).toBeChecked();
    persisted.unmount();
    localStorage.removeItem(LOG_QUERY_EDITOR_MODE_STORAGE_KEY);

    render(
      <I18nextProvider i18n={i18n}>
        <QuerySubject query={{ signal: 'logs', timeRange: 'last-30m', resourceFilter: 'service.name LIKE checkout' }} />
      </I18nextProvider>
    );
    expect(screen.getByRole('radio', { name: 'Code' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Builder' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Resource filter code' })).toHaveValue('service.name LIKE checkout');
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be represented without loss');
  });

  it('offers only shared auto-refresh values for relative windows', () => {
    const time = sharedTime();
    render(
      <I18nextProvider i18n={i18n}>
        <WorkbenchSubject updateQuery={vi.fn()} time={time} />
      </I18nextProvider>
    );

    fireEvent.mouseDown(
      within(screen.getByRole('form', { name: 'Explore query controls' })).getByRole('combobox', {
        name: /Auto refresh/u
      })
    );
    fireEvent.click(screen.getByText('Auto refresh 30s'));
    expect(time.setAutoRefresh).toHaveBeenCalledWith(30_000);
  });

  it('keeps Signal as the only tablist and moves Logs History/Live into the query toolbar', () => {
    const updateScope = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreWorkbench query={{ signal: 'logs', timeRange: 'last-30m' }} t={i18n.t} updateQuery={vi.fn()} />
        <QuerySubject updateScope={updateScope} />
      </I18nextProvider>
    );

    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    const signalTabs = screen.getByRole('tablist', { name: i18n.t('explore.signalsNavigation') });
    expect(within(signalTabs).getAllByRole('tab')).toHaveLength(3);
    const mode = within(screen.getByRole('form', { name: 'Explore query controls' })).getByRole('radiogroup', {
      name: 'Log mode'
    });
    const editor = within(screen.getByRole('form', { name: 'Explore query controls' })).getByRole('radiogroup', {
      name: 'Query editor'
    });
    const command = screen.getByRole('form', { name: 'Explore query controls' });
    expect(within(command).queryByRole('combobox', { name: /Auto refresh/u })).not.toBeInTheDocument();
    expect(within(mode).getByRole('radio', { name: 'History' })).toBeChecked();
    fireEvent.click(within(mode).getByRole('radio', { name: 'Live' }));
    expect(updateScope).toHaveBeenCalledWith({ live: true });
    expect(screen.queryByRole('tab', { name: 'Query' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('form', { name: 'Explore query controls' })).getByRole('button', { name: 'Query' })
    ).toHaveClass('ant-btn-primary');
    const orderedControls = [
      editor,
      within(command).getByRole('combobox', { name: 'Time range' }),
      within(command).getByRole('textbox', { name: 'Logs query' }),
      mode,
      within(command).getByRole('button', { name: 'Query' }),
      within(command).getByRole('button', { name: 'Refresh' })
    ];
    orderedControls.slice(0, -1).forEach((control, index) => {
      expect(control.compareDocumentPosition(orderedControls[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
        0
      );
    });
  });

  it('uses one roving Signal tab stop and supports wrapped arrow, Home, and End navigation', () => {
    const updateQuery = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreWorkbench query={{ signal: 'metrics', timeRange: 'last-30m' }} t={i18n.t} updateQuery={updateQuery} />
      </I18nextProvider>
    );

    const metrics = screen.getByRole('tab', { name: 'Metrics' });
    const logs = screen.getByRole('tab', { name: 'Logs' });
    const traces = screen.getByRole('tab', { name: 'Traces' });
    expect(metrics).toHaveAttribute('tabindex', '0');
    expect(logs).toHaveAttribute('tabindex', '-1');
    expect(traces).toHaveAttribute('tabindex', '-1');

    metrics.focus();
    fireEvent.keyDown(metrics, { key: 'ArrowLeft' });
    expect(traces).toHaveFocus();
    expect(updateQuery).toHaveBeenLastCalledWith(expect.objectContaining({ signal: 'traces', pageIndex: undefined }));

    fireEvent.keyDown(traces, { key: 'Home' });
    expect(metrics).toHaveFocus();
    fireEvent.keyDown(metrics, { key: 'End' });
    expect(traces).toHaveFocus();
    fireEvent.keyDown(traces, { key: 'ArrowLeft' });
    expect(logs).toHaveFocus();
  });

  it('keeps a compact 56px page header and one continuous desktop workbench surface', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreWorkbench query={{ signal: 'logs', timeRange: 'last-30m' }} t={i18n.t} updateQuery={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('banner')).toHaveTextContent(i18n.t('explore.title'));
    expect(screen.getByRole('banner')).not.toHaveTextContent(i18n.t('explore.description'));
    expect(workbenchStylesSource).toMatch(/\.pageHeader\s*\{[^}]*height:\s*56px/s);
    expect(workbenchStylesSource).toMatch(
      /\.pageHeader\s+:global\(h2\.ant-typography\)\s*\{[^}]*font-size:\s*20px[^}]*font-weight:\s*600/s
    );
    expect(workbenchStylesSource).toMatch(
      /\.workspace\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s
    );
    expect(workbenchStylesSource).toMatch(/\.signalPanel\s*\{[^}]*display:\s*flex[^}]*min-height:\s*0[^}]*flex:\s*1/s);
    expect(queryStylesSource).toMatch(/\.logMode\s*\{[^}]*display:\s*inline-flex/s);
    expect(queryStylesSource).not.toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*\border\s*:/s);
    expect(historyStylesSource).toMatch(
      /\.logRegion\[data-explore-log-region='result'\]\s*\{[^}]*min-height:\s*0[^}]*flex:\s*1[^}]*overflow:\s*auto/s
    );
  });

  it('keeps common log dimensions and attribute conditions visible without a disclosure or nested card', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <QuerySubject />
      </I18nextProvider>
    );
    expect(screen.getByLabelText('Service name')).toBeInTheDocument();
    expect(screen.getByLabelText('Service namespace')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Attribute conditions' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Attribute conditions' })?.closest('details')).toBeNull();
    expect(screen.queryByText('Advanced filters')).not.toBeInTheDocument();
    expect(screen.queryByText('Add filters')).not.toBeInTheDocument();
    expect(logQueryBuilderStylesSource).toMatch(/min-height:\s*32px/);
    expect(logQueryBuilderStylesSource).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*min-height:\s*36px/);
    expect(logQueryBuilderStylesSource).toMatch(
      /@media\s*\(max-width:\s*1100px\)[\s\S]*\.conditionField\s*>\s*span\s*\{[^}]*display:\s*block/s
    );
    expect(queryStylesSource).toMatch(/@media\s*\(max-width:\s*880px\)[\s\S]*\.logCommandFields\s*\{[^}]*repeat\(2,/s);
    expect(queryStylesSource).toMatch(
      /@media\s*\(max-width:\s*520px\)[\s\S]*\.logCommandFields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    );
    expect(logQueryBuilderStylesSource).toMatch(
      /@media\s*\(max-width:\s*1100px\)[\s\S]*\.scopeGrid\s*\{[^}]*repeat\(3,/s
    );
    expect(logQueryBuilderStylesSource).toMatch(
      /@media\s*\(max-width:\s*520px\)[\s\S]*\.scopeGrid,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    );
    expect(logQueryBuilderStylesSource).not.toMatch(/border-radius|box-shadow|background(?:-color)?\s*:/);
  });

  it('edits optional QueryContext v1 dimensions as an instance and HTTP route template', () => {
    const query = {
      signal: 'metrics',
      timeRange: 'last-30m',
      instance: 'checkout-7d9',
      endpoint: '/checkout'
    } as const;
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreQueryBar
          query={query}
          t={i18n.t}
          updateQuery={vi.fn()}
          updateScope={vi.fn()}
          refresh={vi.fn().mockResolvedValue(undefined)}
          time={sharedTime()}
          submission={{
            draft: draftFromQuery(query),
            errors: {},
            updateField: vi.fn(),
            submit: vi.fn(),
            removeFilter: vi.fn()
          }}
        />
      </I18nextProvider>
    );

    expect(screen.getByPlaceholderText('Service instance ID')).toHaveValue('checkout-7d9');
    expect(screen.getByPlaceholderText('HTTP route template, for example /checkout')).toHaveValue('/checkout');
    expect(screen.getByText('Instance: checkout-7d9')).toBeInTheDocument();
    expect(screen.getByText('HTTP route: /checkout')).toBeInTheDocument();
  });

  it('delegates refresh without rewriting a scoped fixed window and exposes invalid handoffs', () => {
    const updateQuery = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreWorkbench
          query={{
            signal: 'metrics',
            timeRange: 'last-30m',
            serviceName: 'checkout-api',
            serviceNamespace: 'commerce',
            environment: 'prod',
            collectorId: 'collector-east',
            start: 1_710_000_000_000,
            end: 1_710_000_005_000
          }}
          t={i18n.t}
          updateQuery={updateQuery}
        />
        <ExploreQueryBar
          query={{
            signal: 'metrics',
            timeRange: 'last-30m',
            serviceName: 'checkout-api',
            serviceNamespace: 'commerce',
            environment: 'prod',
            collectorId: 'collector-east',
            start: 1_710_000_000_000,
            end: 1_710_000_005_000
          }}
          t={i18n.t}
          updateQuery={vi.fn()}
          updateScope={updateQuery}
          refresh={refresh}
          time={sharedTime({ autoRefreshMs: 0 })}
          submission={{
            draft: draftFromQuery({
              signal: 'metrics',
              timeRange: 'last-30m',
              start: 1_710_000_000_000,
              end: 1_710_000_005_000
            }),
            errors: {},
            updateField: vi.fn(),
            submit: vi.fn(),
            removeFilter: vi.fn()
          }}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Fixed time window')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(updateQuery).not.toHaveBeenCalled();
    cleanup();
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreWorkbench
          query={{ signal: 'metrics', timeRange: 'last-30m', collectorId: 'collector-east', start: 2_000, end: 1_000 }}
          t={i18n.t}
          updateQuery={vi.fn()}
        />
      </I18nextProvider>
    );
    expect(screen.getByText(en.explore.handoffInvalid)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Auto refresh/u })).not.toBeInTheDocument();
  });
});

function WorkbenchSubject({
  updateQuery,
  time = sharedTime()
}: {
  updateQuery: (changes: ExploreQueryPatch) => void;
  time?: SharedTimeValue;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ExploreWorkbench
        query={{ signal: 'metrics', timeRange: 'last-30m', query: 'http_requests_total' }}
        t={t}
        updateQuery={updateQuery}
      />
      <QuerySubject
        query={{ signal: 'metrics', timeRange: 'last-30m', query: 'http_requests_total' }}
        time={time}
        updateScope={updateQuery}
        refresh={vi.fn().mockResolvedValue(undefined)}
      />
    </>
  );
}

function sharedTime(override: Partial<SharedTimeValue> = {}): SharedTimeValue {
  return {
    policy: 'route_owned',
    headerMode: 'exact_window',
    manualRefreshOwner: 'time_revision',
    window: { from: 1_000, to: 2_000 },
    range: '30m',
    autoRefreshMs: 0,
    remainingMs: null,
    refreshRevision: 0,
    setRange: vi.fn(),
    setAutoRefresh: vi.fn(),
    commitWindow: vi.fn(),
    requestRefresh: vi.fn(),
    ...override
  };
}

function QuerySubject({
  query = { signal: 'logs', timeRange: 'last-30m' },
  time = sharedTime(),
  updateScope = vi.fn(),
  refresh = vi.fn().mockResolvedValue(undefined)
}: {
  query?: Parameters<typeof draftFromQuery>[0];
  time?: SharedTimeValue;
  updateScope?: (changes: ExploreQueryPatch) => void;
  refresh?: () => Promise<void>;
} = {}) {
  const { t } = useTranslation();
  return (
    <ExploreQueryBar
      query={query}
      t={t}
      updateQuery={vi.fn()}
      updateScope={updateScope}
      refresh={refresh}
      time={time}
      submission={{
        draft: draftFromQuery(query),
        errors: {},
        updateField: vi.fn(),
        submit: vi.fn(),
        removeFilter: vi.fn()
      }}
    />
  );
}
