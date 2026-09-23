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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';
import en from '@/assets/i18n/en-us.json';
import { ApiMessageError } from '@/core/http/api-message';
import { RuntimeThemeContext } from '@/core/runtime-theme-context';
import { loadPersesRuntime } from '@/platform/perses/runtime/perses-runtime-registry';
import { ShellInvestigationProvider, useShellInvestigation } from '@/shared/investigation';
import { GlobalTimeProvider, RouteTimeProvider } from '@/shared/time';

import {
  ExploreSignalContractError,
  type ExplorePageResult,
  type LogRow,
  type MetricConsole
} from '../model/explore-signal-contract';

const api = vi.hoisted(() => ({
  loadMetricSignal: vi.fn(),
  loadLogSignal: vi.fn(),
  loadTraceSignal: vi.fn(),
  openLogStream: vi.fn()
}));

vi.mock('../api/explore-api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/explore-api')>()),
  ...api,
  loadLogHistoryEvidence: api.loadLogSignal
}));

import { ExplorePage } from './explore-page';

describe('ExplorePage instrumentation context boundary', () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverStub, configurable: true });
    await initializeI18n();
    await loadLocale('en-US');
    await loadPersesRuntime('multi-signal');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    const pending = () => new Promise<never>(() => undefined);
    api.loadMetricSignal.mockImplementation(pending);
    api.loadLogSignal.mockImplementation(pending);
    api.loadTraceSignal.mockImplementation(pending);
    api.openLogStream.mockReturnValue({
      close: vi.fn(),
      addEventListener: vi.fn(),
      onopen: null,
      onerror: null
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('uses the shared operational workspace and compact loading evidence', () => {
    renderPage('/explore?signal=metrics');

    expect(document.querySelector('[data-hb-operational-page][data-mode="workspace"]')).toBeInTheDocument();
    expect(document.querySelector('[data-hb-operational-command-bar]')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('explore.states.loading')).closest('[data-state]')).toHaveAttribute(
      'data-state',
      'loading'
    );
  });

  it('keeps the default query surface focused and submits guided filters from a disclosure', async () => {
    renderPage('/explore?signal=metrics');

    const primaryQuery = screen.getByRole('textbox', { name: i18n.t('explore.queryLabels.metrics') });
    expect(screen.getByRole('textbox', { name: en.explore.serviceName })).not.toBeVisible();
    expect(screen.getByRole('textbox', { name: en.explore.environment })).not.toBeVisible();
    expect(screen.getByText(en.explore.advancedFilters)).toBeInTheDocument();

    fireEvent.click(screen.getByText(i18n.t('explore.addFilters')));
    const serviceName = screen.getByRole('textbox', { name: en.explore.serviceName });
    const environment = screen.getByRole('textbox', { name: en.explore.environment });
    fireEvent.change(primaryQuery, { target: { value: 'http_request_duration_seconds' } });
    fireEvent.change(serviceName, { target: { value: 'checkout' } });
    fireEvent.change(environment, { target: { value: 'prod' } });
    fireEvent.click(querySubmitButton());

    await waitFor(() =>
      expect(locationParams()).toEqual(
        expect.objectContaining({
          query: 'http_request_duration_seconds',
          serviceName: 'checkout',
          environment: 'prod'
        })
      )
    );
  });

  it('does not widen partial or reversed instrumentation scope into any signal query or SSE stream', async () => {
    const invalidEntries = [
      '/explore?signal=metrics&intakeProfileId=primary-ingress&serviceName=checkout&serviceNamespace=commerce&start=1000&end=2000',
      '/explore?signal=logs&serviceName=checkout&serviceNamespace=commerce&environment=prod&collectorId=east&start=2000&end=1000',
      '/explore?signal=traces&collectorId=east',
      '/explore?signal=traces&serviceName=checkout&serviceNamespace=commerce&environment=prod' +
        '&collectorId=east&windowMode=preset&start=1000',
      '/explore?signal=traces&windowMode=preset&start=1000',
      '/explore?signal=traces&windowMode=preset&start=2000&end=1000',
      '/explore?signal=logs&mode=live&collectorId=east'
    ];

    for (const entry of invalidEntries) {
      renderPage(entry);
      expect(await screen.findByText(en.explore.handoffInvalid)).toBeInTheDocument();
      cleanup();
    }

    expect(api.loadMetricSignal).not.toHaveBeenCalled();
    expect(api.loadLogSignal).not.toHaveBeenCalled();
    expect(api.loadTraceSignal).not.toHaveBeenCalled();
    expect(api.openLogStream).not.toHaveBeenCalled();
  });

  it('queries history and opens live SSE for ordinary direct Explore scope', async () => {
    const scope =
      'serviceName=checkout&serviceNamespace=commerce&environment=prod&instance=checkout-1&endpoint=%2Fcheckout';
    renderPage(`/explore?signal=metrics&${scope}`);

    await waitFor(() =>
      expect(api.loadMetricSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: 'metrics',
          serviceName: 'checkout',
          serviceNamespace: 'commerce',
          environment: 'prod',
          instance: 'checkout-1',
          endpoint: '/checkout'
        }),
        expect.any(AbortSignal)
      )
    );
    expect(screen.queryByText(en.explore.handoffInvalid)).not.toBeInTheDocument();
    cleanup();

    renderPage(`/explore?signal=logs&mode=live&${scope}`);
    await waitFor(() =>
      expect(api.openLogStream).toHaveBeenCalledWith(
        '/api/logs/sse/subscribe?serviceName=checkout&serviceNamespace=commerce&environment=prod' +
          '&instance=checkout-1&endpoint=%2Fcheckout',
        expect.any(Object)
      )
    );
    expect(screen.queryByText(en.explore.handoffInvalid)).not.toBeInTheDocument();
  });

  it('keeps the live log SSE stream stable without exposing auto-refresh in the fixed Logs row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    renderPage('/explore?signal=logs&mode=live');
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(api.openLogStream).toHaveBeenCalledOnce();
    expect(screen.queryByRole('combobox', { name: /Auto refresh/u })).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(api.openLogStream).toHaveBeenCalledOnce();
  });

  it('preserves a complete scoped instrumentation handoff', async () => {
    renderPage(
      '/explore?signal=logs&serviceName=checkout&serviceNamespace=commerce&environment=prod' +
        '&collectorId=east&start=1710000000000&end=1710000005000'
    );

    await waitFor(() =>
      expect(api.loadLogSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: 'logs',
          serviceName: 'checkout',
          serviceNamespace: 'commerce',
          environment: 'prod',
          collectorId: 'east',
          start: 1_710_000_000_000,
          end: 1_710_000_005_000
        }),
        expect.any(AbortSignal)
      )
    );
  });

  it.each(['logs', 'traces'] as const)(
    'keeps the exact instrumentation scope and Collector chip when submitting a %s query',
    async signal => {
      renderPage(
        `/explore?signal=${signal}&serviceName=checkout&serviceNamespace=commerce&environment=prod` +
          '&intakeProfileId=collector%3Aeast&collectorId=east&instance=checkout-1&endpoint=%2Fcheckout' +
          '&start=1710000000000&end=1710000005000'
      );
      const collectorLabel = i18n.t('explore.collectorContext', { value: 'east' });

      expect(await screen.findByText(collectorLabel)).toBeInTheDocument();
      fireEvent.click(querySubmitButton());

      await waitFor(() =>
        expect(locationParams()).toEqual(
          expect.objectContaining({
            signal,
            serviceName: 'checkout',
            serviceNamespace: 'commerce',
            environment: 'prod',
            intakeProfileId: 'collector:east',
            collectorId: 'east',
            instance: 'checkout-1',
            endpoint: '/checkout',
            start: '1710000000000',
            end: '1710000005000'
          })
        )
      );
      expect(screen.getByText(collectorLabel)).toBeInTheDocument();
    }
  );

  it('retires instrumentation markers when removing a query-bar active filter', async () => {
    api.loadMetricSignal.mockResolvedValue(metricState('no_context', null));
    renderPage(
      '/explore?signal=metrics&serviceName=checkout&serviceNamespace=commerce&environment=prod' +
        '&collectorId=east&windowMode=preset'
    );
    await waitFor(() => expect(api.loadMetricSignal).toHaveBeenCalledOnce());

    const collector = screen.getByText(i18n.t('explore.collectorContext', { value: 'east' })).closest('.ant-tag');
    expect(collector).not.toBeNull();
    fireEvent.click(within(collector as HTMLElement).getByRole('img', { name: 'Close' }));

    await waitFor(() => expect(api.loadMetricSignal).toHaveBeenCalledTimes(2));
    expect(locationParams()).not.toHaveProperty('collectorId');
    expect(locationParams()).not.toHaveProperty('intakeProfileId');
    expect(locationParams()).not.toHaveProperty('windowMode');
    expect(locationParams()).toEqual(
      expect.objectContaining({
        signal: 'metrics',
        serviceName: 'checkout',
        serviceNamespace: 'commerce',
        environment: 'prod'
      })
    );
  });

  it.each(['metrics', 'logs', 'traces'] as const)(
    'queries %s from a complete direct-server handoff without showing invalid context',
    async signal => {
      renderPage(
        `/explore?signal=${signal}&intakeProfileId=primary-ingress&serviceName=checkout` +
          '&serviceNamespace=commerce&environment=prod&start=1710000000000&end=1710000005000'
      );
      const loader =
        signal === 'metrics' ? api.loadMetricSignal : signal === 'logs' ? api.loadLogSignal : api.loadTraceSignal;

      await waitFor(() =>
        expect(loader).toHaveBeenCalledWith(
          expect.objectContaining({
            signal,
            intakeProfileId: 'primary-ingress',
            serviceName: 'checkout',
            serviceNamespace: 'commerce',
            environment: 'prod',
            collectorId: undefined,
            start: 1_710_000_000_000,
            end: 1_710_000_005_000
          }),
          expect.any(AbortSignal)
        )
      );
      expect(screen.queryByText(en.explore.handoffInvalid)).not.toBeInTheDocument();
    }
  );

  it('drops an invalid URL filter and keeps typed controls local until a valid submission', async () => {
    renderPage('/explore?signal=metrics&page=4&aggregation=p95');
    await waitFor(() =>
      expect(locationParams()).toEqual(
        expect.objectContaining({
          signal: 'metrics',
          timeRange: 'last-30m'
        })
      )
    );
    const initialSearch = screen.getByTestId('location').textContent;
    fireEvent.click(screen.getByText(en.explore.advancedFilters));
    const step = screen.getByPlaceholderText(en.exploreMetric.step);
    fireEvent.change(step, { target: { value: '0' } });
    expect(screen.getByTestId('location')).toHaveTextContent(initialSearch ?? '');

    fireEvent.click(querySubmitButton());
    expect(await screen.findByText(en.explore.submissionErrors.invalidStep)).toBeInTheDocument();
    expect(screen.queryByText(en.explore.submissionErrors.unsupportedAggregation)).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(initialSearch ?? '');

    fireEvent.change(step, { target: { value: '60' } });
    const aggregation = screen.getByRole('combobox', { name: en.exploreMetric.aggregation });
    await selectOption(aggregation, 'sum');
    expect(screen.getByTestId('location')).toHaveTextContent(initialSearch ?? '');
    fireEvent.click(querySubmitButton());

    await waitFor(() =>
      expect(locationParams()).toEqual(
        expect.objectContaining({
          signal: 'metrics',
          aggregation: 'sum',
          step: '60'
        })
      )
    );
    expect(locationParams()).not.toHaveProperty('page');
  });

  it('does not commit controlled log and trace toggles before submission', async () => {
    renderPage('/explore?signal=logs');
    const severity = screen.getByRole('combobox', { name: en.explore.severity });
    const traceId = screen.getByRole('textbox', { name: en.explore.traceId });
    const spanId = screen.getByRole('textbox', { name: en.explore.spanId });
    await selectOption(severity, 'ERROR');
    fireEvent.change(traceId, { target: { value: 'trace-1' } });
    fireEvent.change(spanId, { target: { value: 'span-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: en.exploreLog.hideInternal }));
    fireEvent.click(screen.getByRole('checkbox', { name: en.exploreLog.hideNoise }));
    expect(locationParams()).not.toHaveProperty('severityText');
    expect(locationParams()).not.toHaveProperty('traceId');
    expect(locationParams()).not.toHaveProperty('spanId');
    expect(locationParams()).not.toHaveProperty('hideInternal');
    expect(locationParams()).not.toHaveProperty('hideNoise');
    fireEvent.click(querySubmitButton());
    await waitFor(() =>
      expect(locationParams()).toEqual(
        expect.objectContaining({
          severityText: 'ERROR',
          traceId: 'trace-1',
          spanId: 'span-1',
          hideInternal: 'true',
          hideNoise: 'true'
        })
      )
    );

    cleanup();
    renderPage('/explore?signal=traces');
    fireEvent.click(screen.getByText(en.explore.advancedFilters));
    const attributeFilter = screen.getByPlaceholderText(i18n.t('exploreTrace.attributeFilter'));
    fireEvent.change(attributeFilter, { target: { value: 'http.route=/checkout' } });
    fireEvent.click(screen.getByRole('checkbox', { name: en.exploreTrace.errorOnly }));
    expect(locationParams()).not.toHaveProperty('errorOnly');
    expect(locationParams()).not.toHaveProperty('attributeFilter');
    fireEvent.click(querySubmitButton());
    await waitFor(() =>
      expect(locationParams()).toEqual(
        expect.objectContaining({ errorOnly: 'true', attributeFilter: 'http.route=/checkout' })
      )
    );
  });

  it('renders localized signal-specific parity controls in the advanced filter surface', async () => {
    renderPage('/explore?signal=metrics');
    fireEvent.click(screen.getByText(en.explore.advancedFilters));
    const temporalAggregation = screen.getByRole('combobox', { name: en.exploreMetric.temporalAggregation });
    await selectOption(temporalAggregation, en.exploreMetric.temporalAggregationValues.rate);
    expect(screen.getAllByText(en.exploreMetric.temporalAggregationValues.rate).length).toBeGreaterThan(0);

    cleanup();
    renderPage('/explore?signal=traces');
    fireEvent.click(screen.getByText(en.explore.advancedFilters));
    const spanScope = screen.getByRole('combobox', { name: en.exploreTrace.spanScope });
    await selectOption(spanScope, en.exploreTrace.spanScopeValues.root);
    expect(screen.getAllByText(en.exploreTrace.spanScopeValues.root).length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: en.exploreTrace.hideInternal })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(i18n.t('exploreTrace.attributeFilter'))).toBeInTheDocument();

    cleanup();
    renderPage('/explore?signal=logs');
    expect(screen.queryByText(en.explore.advancedFilters)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: en.explore.serviceName })).toBeVisible();
    expect(screen.getByRole('textbox', { name: i18n.t('explore.serviceNamespace') })).toBeVisible();
    expect(screen.getByRole('textbox', { name: en.explore.environment })).toBeVisible();
    expect(screen.getByRole('combobox', { name: en.explore.severity }).closest('.ant-select')).toBeVisible();
    expect(screen.getByRole('textbox', { name: en.explore.traceId })).toBeVisible();
    expect(screen.getByRole('textbox', { name: en.explore.spanId })).toBeVisible();
    expect(screen.getByRole('group', { name: i18n.t('explore.logQueryBuilder.conditions') })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: en.exploreLog.hideInternal })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: en.exploreLog.hideNoise })).toBeInTheDocument();
  });

  it('associates trace duration validation feedback with the invalid field', async () => {
    renderPage('/explore?signal=traces');
    fireEvent.click(screen.getByText(en.explore.advancedFilters));
    const min = screen.getByPlaceholderText(en.exploreTrace.minDuration);
    const max = screen.getByPlaceholderText(en.exploreTrace.maxDuration);

    fireEvent.change(min, { target: { value: '1.5' } });
    fireEvent.click(querySubmitButton());
    const invalidDuration = await screen.findByText(en.explore.submissionErrors.invalidDuration);
    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(min).toHaveAttribute('aria-describedby', invalidDuration.id);

    fireEvent.change(min, { target: { value: '200' } });
    fireEvent.change(max, { target: { value: '100' } });
    fireEvent.click(querySubmitButton());
    const ordering = await screen.findByText(en.explore.submissionErrors.minExceedsMax);
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveAttribute('aria-describedby', ordering.id);
  });

  it.each([
    ['no_context', 'missingContext', 'Choose a metric or service context.', false],
    ['unsupported_query', 'unsupportedQuery', null, false],
    ['load_failed', 'storageUnavailable', null, true]
  ] as const)(
    'renders the metric backend state %s without inventing empty data',
    async (reason, messageKey, errorMessage, retryable) => {
      api.loadMetricSignal.mockResolvedValue(metricState(reason, errorMessage));
      renderPage('/explore?signal=metrics');
      expect(await screen.findByText(i18n.t(`explore.states.${messageKey}`))).toBeInTheDocument();
      expect(screen.queryByText(en.explore.empty.metrics)).not.toBeInTheDocument();
      if (retryable) expect(screen.getByRole('button', { name: en.common.retry })).toBeInTheDocument();
      else expect(screen.queryByRole('button', { name: en.common.retry })).not.toBeInTheDocument();
    }
  );

  it('shows the metric backend error message and retries the same query', async () => {
    api.loadMetricSignal.mockResolvedValue(metricBackendError('storage offline'));
    renderPage('/explore?signal=metrics');

    expect(await screen.findByText('storage offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.common.retry }));
    await waitFor(() => expect(api.loadMetricSignal).toHaveBeenCalledTimes(2));
  });

  it.each([
    [new ApiMessageError('forbidden', { status: 403 }), 'common.permission.roleRequiredDescription'],
    [new ApiMessageError('offline', { status: 503 }), 'explore.states.transportError'],
    [new ExploreSignalContractError('invalid payload'), 'explore.states.contractError']
  ] as const)('renders classified request failures without calling them empty', async (reason, messageKey) => {
    api.loadLogSignal.mockRejectedValue(reason);
    renderPage('/explore?signal=logs');
    expect(await screen.findByText(i18n.t(messageKey))).toBeInTheDocument();
    expect(screen.queryByText(en.explore.empty.logs)).not.toBeInTheDocument();
  });

  it('exposes historical Logs as ordered flat Query, Trend, and Result sibling regions', async () => {
    api.loadLogSignal.mockResolvedValueOnce(logEvidence(logPage('flat log evidence', 'not-a-trace-id')));
    renderPage('/explore?signal=logs');
    expect(await screen.findByRole('row', { name: /flat log evidence/u })).toBeInTheDocument();

    const panel = screen.getByRole('tabpanel', { name: en.explore.signals.logs });
    expect(panel).toHaveAttribute('data-layout', 'continuous');
    expect(panel.closest('[data-explore-workspace="true"]')).toHaveAttribute('data-layout', 'continuous');
    const regions = Array.from(panel.querySelectorAll(':scope > [data-explore-log-region]'));
    expect(regions.map(region => region.getAttribute('data-explore-log-region'))).toEqual(['query', 'trend', 'result']);
    regions.forEach(region => {
      expect(region.querySelector('.ant-card, [data-surface="card"], [data-hb-card]')).toBeNull();
    });
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Explore query updates' })).toHaveTextContent(
        'Query complete. 1 result.'
      )
    );
  });

  it.each(['metrics', 'traces'] as const)('keeps the Logs flat-stack contract scoped away from %s', signal => {
    renderPage(`/explore?signal=${signal}`);
    const panel = screen.getByRole('tabpanel', { name: en.explore.signals[signal] });
    expect(panel.querySelector('[data-explore-log-region]')).toBeNull();
  });

  it('labels retained log evidence during refresh and disables stale drilldowns until replacement succeeds', async () => {
    const refresh = deferred(logEvidence(logPage('fresh evidence', 'fedcba9876543210fedcba9876543210')));
    api.loadLogSignal
      .mockResolvedValueOnce(logEvidence(logPage('cached evidence', '0123456789abcdef0123456789abcdef')))
      .mockReturnValueOnce(refresh.promise);
    renderPage('/explore?signal=logs');
    const cachedRow = await screen.findByRole('row', { name: /cached evidence/u });
    fireEvent.click(cachedRow);
    expect(screen.getByRole('button', { name: i18n.t('explore.perses.openTraceAction') })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: en.common.refresh }));

    expect(await screen.findByText(i18n.t('explore.states.refreshing'))).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: i18n.t('explore.perses.logInspector') })).not.toBeInTheDocument();
    fireEvent.click(cachedRow);
    expect(screen.queryByRole('dialog', { name: i18n.t('explore.perses.logInspector') })).not.toBeInTheDocument();
    expect(screen.getAllByText(/cached evidence/u).length).toBeGreaterThan(0);

    refresh.resolve();
    await waitFor(() => expect(screen.queryByText(i18n.t('explore.states.refreshing'))).not.toBeInTheDocument());
    const freshRow = await screen.findByRole('row', { name: /fresh evidence/u });
    fireEvent.click(freshRow);
    expect(screen.getByRole('button', { name: i18n.t('explore.perses.openTraceAction') })).toBeEnabled();
  });

  it('keeps refresh failure classification visible while retained evidence remains non-actionable', async () => {
    api.loadLogSignal
      .mockResolvedValueOnce(logEvidence(logPage('cached evidence', '0123456789abcdef0123456789abcdef')))
      .mockRejectedValueOnce(new ApiMessageError('offline', { status: 503 }));
    renderPage('/explore?signal=logs');
    const cachedRow = await screen.findByRole('row', { name: /cached evidence/u });
    fireEvent.click(cachedRow);

    fireEvent.click(screen.getByRole('button', { name: en.common.refresh }));

    expect(await screen.findByText(/Refresh failed/u)).toHaveTextContent(i18n.t('explore.states.transportError'));
    expect(screen.queryByRole('dialog', { name: i18n.t('explore.perses.logInspector') })).not.toBeInTheDocument();
    expect(screen.getByTestId('investigation-target')).toHaveTextContent('none');
  });

  it('publishes only the current non-empty exact Log page as an investigation target', async () => {
    api.loadLogSignal.mockResolvedValueOnce(logEvidence(logPage('ready evidence', '0123456789abcdef0123456789abcdef')));
    renderPage(
      '/explore?signal=logs&start=1000&end=2000&serviceName=checkout' +
        '&traceId=0123456789abcdef0123456789abcdef' +
        '&severityText=warn&hideNoise=true'
    );

    const readyRow = await screen.findByRole('row', { name: /ready evidence/u });
    expect(JSON.parse(screen.getByTestId('investigation-target').textContent ?? '')).toEqual({
      log: {
        start: 1_000,
        end: 2_000,
        traceId: '0123456789abcdef0123456789abcdef',
        severityText: 'WARN',
        serviceName: 'checkout',
        hideInternal: false,
        hideNoise: true,
        pageIndex: 0,
        pageSize: 20
      }
    });

    fireEvent.click(readyRow);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('explore.perses.investigateLogAction') }));
    await waitFor(() =>
      expect(locationParams()).toMatchObject({
        signal: 'logs',
        logRecordUid: 'log-ready-evidence',
        start: '1000',
        end: '2000'
      })
    );
  });

  it('bounds Log row summaries and keeps unavailable Inspector actions inert', async () => {
    const longBody = 'x'.repeat(300);
    const page = logPage(longBody, 'not-a-trace-id');
    page.content.push({ ...page.content[0]!, logRecordUid: null, traceId: null, body: 'no actions' });
    page.totalElements = 2;
    api.loadLogSignal.mockResolvedValueOnce(logEvidence(page));

    renderPage('/explore?signal=logs');

    const rows = await screen.findAllByRole('row');
    expect(rows[0]?.getAttribute('aria-label')?.length).toBeLessThan(140);
    fireEvent.click(rows[1]!);
    expect(screen.getByRole('button', { name: i18n.t('explore.perses.investigateLogAction') })).toBeDisabled();
    expect(screen.getByRole('button', { name: i18n.t('explore.perses.openTraceAction') })).toBeDisabled();
    expect(document.querySelector('[data-perses-host-interactions]')).toBeNull();
  });

  it('opens a trusted historical trace row as an exact focused investigation', async () => {
    api.loadTraceSignal.mockResolvedValueOnce({
      content: [traceRow()],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 20
    });
    renderPage(
      '/explore?signal=traces&serviceName=checkout&serviceNamespace=commerce&environment=prod' +
        '&intakeProfileId=collector%3Aeast&collectorId=east&instance=checkout-1&endpoint=%2Fcheckout' +
        '&start=1000&end=2000'
    );

    const interactions = await screen.findByText(i18n.t('explore.perses.investigationActions', { count: 1 }));
    fireEvent.click(interactions);
    fireEvent.click(screen.getByRole('button', { name: /Investigate trace/u }));

    await waitFor(() =>
      expect(locationParams()).toMatchObject({
        signal: 'traces',
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        start: '1000',
        end: '2000',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    );
  });
});

function traceRow() {
  return {
    traceId: '0123456789abcdef0123456789abcdef',
    rootSpanId: '0123456789abcdef',
    serviceName: 'checkout',
    serviceNamespace: 'commerce',
    rootSpanName: 'POST /checkout',
    durationNanos: 1_000_000,
    status: 'OK',
    startTime: 1_200,
    errorSpanCount: 0,
    resourceAttributes: {},
    spanCount: 1,
    serviceStats: { checkout: { spanCount: 1, errorCount: 0 } }
  };
}

function logPage(body: string, traceId: string): ExplorePageResult<LogRow> {
  return {
    content: [
      {
        logRecordUid: `log-${body.replace(/\s+/gu, '-')}`,
        timeUnixNano: '1750000000000000000',
        observedTimeUnixNano: null,
        severityNumber: null,
        severityText: 'INFO',
        body,
        attributes: null,
        droppedAttributesCount: null,
        traceId,
        spanId: null,
        traceFlags: null,
        resource: null,
        resourceSchemaUrl: null,
        instrumentationScope: null,
        scopeSchemaUrl: null
      }
    ],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20
  };
}

function logEvidence(page: ExplorePageResult<LogRow>) {
  return {
    page,
    overview: {
      kind: 'ready' as const,
      data: {
        totalCount: page.totalElements,
        traceCount: 0,
        debugCount: 0,
        infoCount: page.totalElements,
        warnCount: 0,
        errorCount: 0,
        fatalCount: 0
      }
    },
    trend: {
      kind: 'ready' as const,
      data: { start: 1_754_467_200_000, end: 1_754_469_000_000, intervalMs: 60_000, buckets: [] }
    }
  };
}

function deferred<T>(value: T) {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise(value) };
}

function metricState(emptyStateReason: string, errorMessage: string | null): MetricConsole {
  return {
    context: null,
    query: null,
    datasource: null,
    queryMode: null,
    results: null,
    stats: { totalSeries: 0, nonEmptySeries: 0, latestObservedAt: null },
    emptyStateReason,
    errorMessage
  };
}

function metricBackendError(message: string): MetricConsole {
  return {
    ...metricState('', null),
    results: { refId: null, status: 503, msg: message, frames: [] },
    emptyStateReason: null
  };
}

function renderPage(initialEntry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <GlobalTimeProvider>
            <RouteTimeProvider policy="route_owned" canonicalizeInvalidExact={false}>
              <RuntimeThemeContext.Provider value={{ theme: 'default', setTheme: vi.fn() }}>
                <App>
                  <ShellInvestigationProvider>
                    <ExplorePage />
                    <LocationProbe />
                    <InvestigationProbe />
                  </ShellInvestigationProvider>
                </App>
              </RuntimeThemeContext.Provider>
            </RouteTimeProvider>
          </GlobalTimeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function InvestigationProbe() {
  const investigation = useShellInvestigation();
  return <output data-testid="investigation-target">{investigation ? JSON.stringify(investigation) : 'none'}</output>;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function locationParams() {
  return Object.fromEntries(new URLSearchParams(screen.getByTestId('location').textContent ?? ''));
}

function querySubmitButton() {
  const button = screen
    .getAllByRole('button', { name: en.common.query })
    .find(candidate => candidate.getAttribute('type') === 'submit');
  if (!button) throw new Error('Explore query submit button is missing');
  return button;
}

async function selectOption(combobox: HTMLElement, label: string) {
  fireEvent.mouseDown(combobox);
  const options = await screen.findAllByText(label);
  const option = options.at(-1);
  if (!option) throw new Error(`Select option is missing: ${label}`);
  fireEvent.click(option);
}

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 800, height: 360 } as DOMRectReadOnly } as ResizeObserverEntry],
      this
    );
  }
  unobserve() {}
  disconnect() {}
}
