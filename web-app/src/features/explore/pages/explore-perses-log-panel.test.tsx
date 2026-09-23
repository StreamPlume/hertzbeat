/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import resultFrameStyles from '../components/signal-result-frame.module.css?raw';
import toolbarStyles from '../components/explore-log-result-toolbar.module.css?raw';
import inspectorStyles from '../components/explore-log-inspector.module.css?raw';

type MockRowSelection = {
  getAriaLabel: (index: number) => string;
  onSelect: (index: number, row: HTMLElement) => void;
};

const persesContract = vi.hoisted<{
  logDisplay: unknown;
  rowSelection: MockRowSelection | undefined;
  rowCount: number;
}>(() => ({
  logDisplay: undefined,
  rowSelection: undefined,
  rowCount: 1
}));

vi.mock('@/platform/perses', () => ({
  HERTZBEAT_QUERY_LIMITS: { maximumWindowMs: 86_400_000 },
  orderHertzBeatLogRowsForPerses: (rows: Array<{ timeUnixNano: string | null; observedTimeUnixNano: string | null }>) =>
    [...rows].sort((left, right) =>
      (right.timeUnixNano ?? right.observedTimeUnixNano ?? '0').localeCompare(
        left.timeUnixNano ?? left.observedTimeUnixNano ?? '0'
      )
    ),
  HertzBeatLogsTableResult: ({
    logDisplay,
    logRowSelection
  }: {
    logDisplay?: unknown;
    logRowSelection?: MockRowSelection;
  }) => {
    persesContract.logDisplay = logDisplay;
    persesContract.rowSelection = logRowSelection;
    return (
      <div>
        {Array.from({ length: persesContract.rowCount }, (_, index) => (
          <button
            key={index}
            type="button"
            data-log-index={index}
            onClick={event => logRowSelection?.onSelect(index, event.currentTarget)}
          >
            {logRowSelection?.getAriaLabel(index)}
          </button>
        ))}
      </div>
    );
  },
  HertzBeatMetricTimeSeriesResult: ({
    onTimeWindowChange,
    timeWindowChangeEnabled
  }: {
    onTimeWindowChange?: ((window: { from: number; to: number }) => void) | undefined;
    timeWindowChangeEnabled?: boolean | undefined;
  }) => (
    <button
      type="button"
      disabled={!timeWindowChangeEnabled}
      onClick={() => onTimeWindowChange?.({ from: evidenceWindow.from + 60_000, to: evidenceWindow.to - 60_000 })}
    >
      Zoom trend
    </button>
  )
}));

import type { LogExploreQuery } from '../model/explore-query';
import type { LogHistoryEvidence } from '../model/explore-signal-contract';
import { ExplorePersesLogPanel } from './explore-perses-log-panel';

const evidenceWindow = { from: 1_750_000_000_000, to: 1_750_003_600_000 } as const;

describe('ExplorePersesLogPanel trend ownership', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });
  beforeEach(() => {
    localStorage.clear();
    persesContract.logDisplay = undefined;
    persesContract.rowSelection = undefined;
  });

  it('keeps the result identity stable while stretching toolbar actions to the right boundary', () => {
    expect(resultFrameStyles).toMatch(/\.identity\s*\{[^}]*flex:\s*none[^}]*white-space:\s*nowrap/s);
    expect(resultFrameStyles).toMatch(/\.headerTools\s*\{[^}]*flex:\s*1 1 auto/s);
    expect(toolbarStyles).toMatch(/\.toolbar\s*\{[^}]*width:\s*100%[^}]*flex:\s*1 1 auto/s);
  });
  afterEach(cleanup);

  it('keeps result status, display controls, and pagination in one header and persists display changes', () => {
    localStorage.clear();
    const openPath = vi.fn();
    const view = renderPanel(query, true, openPath);

    const result = view.container.querySelector('[data-explore-log-region="result"]');
    expect(result).not.toBeNull();
    expect(result?.querySelectorAll('header')).toHaveLength(1);
    expect(screen.getByText('1 / 57')).toBeInTheDocument();
    expect(screen.getByLabelText('Page: 3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /^Historical result pages/u })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /^Historical result pages/u })).toHaveAttribute(
      'data-pagination-variant',
      'compact'
    );
    expect(result?.lastElementChild).not.toHaveAttribute('aria-label', 'Historical result pages');

    fireEvent.click(screen.getByRole('button', { name: 'Compact rows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wrap messages' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show time' }));

    expect(persesContract.logDisplay).toEqual({ density: 'compact', wrap: false, showTime: false });
    view.unmount();
    renderPanel(query, true, openPath);
    expect(persesContract.logDisplay).toEqual({ density: 'compact', wrap: false, showTime: false });
  });

  it('turns real severity totals into query filters while keeping trace count static', () => {
    const openPath = vi.fn();
    renderPanel(query, true, openPath);

    expect(screen.getByText('Trace')).not.toHaveAttribute('role', 'button');
    fireEvent.click(screen.getByRole('button', { name: 'Info 56' }));
    let params = new URLSearchParams(String(openPath.mock.calls.at(-1)?.[0]).split('?')[1]);
    expect(params.get('severityText')).toBe('INFO');
    expect(params.has('page')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Total 57' }));
    params = new URLSearchParams(String(openPath.mock.calls.at(-1)?.[0]).split('?')[1]);
    expect(params.has('severityText')).toBe(false);
    expect(params.has('page')).toBe(false);
  });

  it('publishes a current trend zoom as a canonical exact query and shows offset-page provenance', () => {
    const openPath = vi.fn();
    renderPanel(query, true, openPath);

    expect(screen.getByText('1 / 57')).toBeInTheDocument();
    expect(screen.getByLabelText('Page: 3 / 3')).toBeInTheDocument();
    const exactWindow = `${new Date(evidenceWindow.from).toISOString()} – ${new Date(evidenceWindow.to).toISOString()}`;
    expect(screen.getByLabelText(exactWindow)).toBeInTheDocument();
    expect(screen.queryByText(exactWindow)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom trend' }));

    const params = new URLSearchParams(String(openPath.mock.calls[0]?.[0]).split('?')[1]);
    expect(Object.fromEntries(params)).toMatchObject({
      signal: 'logs',
      serviceName: 'checkout',
      serviceNamespace: 'commerce',
      environment: 'prod',
      query: 'timeout',
      severityText: 'WARN',
      resourceFilter: 'cloud.region=us-east',
      attributeFilter: 'http.status_code=500',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      start: String(evidenceWindow.from + 60_000),
      end: String(evidenceWindow.to - 60_000)
    });
    expect(params.has('windowMode')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.has('logRecordUid')).toBe(false);
  });

  it('does not expose trend zoom while retained evidence is stale', () => {
    const openPath = vi.fn();
    renderPanel(query, false, openPath);

    expect(screen.getByRole('button', { name: 'Zoom trend' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom trend' }));
    expect(openPath).not.toHaveBeenCalled();
  });

  it('reports zero pages for an empty response instead of an impossible requested page', () => {
    renderPanel({ ...query, pageIndex: 4 }, true, vi.fn(), {
      ...page,
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0
    });

    expect(screen.getByLabelText('Page: 0 / 0')).toBeInTheDocument();
    expect(screen.queryByText('5 / 0')).not.toBeInTheDocument();
  });

  it('inspects the same timestamp-descending row rendered by Perses without changing result geometry', async () => {
    const newest = {
      ...page.content[0]!,
      logRecordUid: 'newest',
      body: 'newest rendered row',
      timeUnixNano: '1750000002000000000',
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef'
    };
    const older = {
      ...page.content[0]!,
      logRecordUid: 'older',
      body: 'older source row',
      timeUnixNano: '1750000001000000000'
    };
    const openPath = vi.fn();
    const view = renderPanel(query, true, openPath, { ...page, content: [older, newest] });
    const host = view.container.querySelector('[data-log-inspector-open]');
    expect(host).toHaveAttribute('data-log-inspector-open', 'false');
    expect(inspectorStyles).toMatch(/\.inspector\s*\{[^}]*position:\s*absolute/s);
    expect(persesContract.rowSelection?.getAriaLabel(99)).toBe('Historical logs');

    const firstRenderedRow = screen.getByRole('button', { name: /newest rendered row/u });
    fireEvent.click(firstRenderedRow);
    expect(screen.getByRole('dialog', { name: 'Log inspector' })).toHaveTextContent('newest rendered row');
    expect(host).toHaveAttribute('data-log-inspector-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    expect(openPath.mock.calls.at(-1)?.[0]).toContain('logRecordUid=newest');

    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    await waitFor(() => expect(firstRenderedRow).toHaveFocus());
    expect(host).toHaveAttribute('data-log-inspector-open', 'false');
  });

  it.each<
    [
      string,
      {
        revision?: number;
        query?: LogExploreQuery;
        timeWindow?: { from: number; to: number };
        evidenceCurrent?: boolean;
      }
    ]
  >([
    ['refresh revision', { revision: 2 }],
    ['filter or pagination scope', { query: { ...query, pageIndex: 1, severityText: 'ERROR' } }],
    ['time window', { timeWindow: { from: evidenceWindow.from + 1_000, to: evidenceWindow.to } }],
    ['stale evidence', { evidenceCurrent: false }]
  ])('closes an outdated inspector after %s changes', (_label, update) => {
    const openPath = vi.fn();
    const view = renderPanel(query, true, openPath);
    fireEvent.click(screen.getByRole('button', { name: /timeout/u }));
    expect(screen.getByRole('dialog', { name: 'Log inspector' })).toBeInTheDocument();

    view.rerender(
      panelView(
        update.query ?? query,
        update.evidenceCurrent ?? true,
        openPath,
        page,
        update.revision ?? 1,
        update.timeWindow ?? evidenceWindow
      )
    );
    expect(screen.queryByRole('dialog', { name: 'Log inspector' })).not.toBeInTheDocument();
  });
});

const query: LogExploreQuery = {
  signal: 'logs',
  timeRange: 'last-30m',
  windowMode: 'preset',
  pageIndex: 2,
  logRecordUid: 'record-1',
  serviceName: 'checkout',
  serviceNamespace: 'commerce',
  environment: 'prod',
  query: 'timeout',
  severityText: 'WARN',
  resourceFilter: 'cloud.region=us-east',
  attributeFilter: 'http.status_code=500',
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef'
};

const page: LogHistoryEvidence['page'] = {
  content: [
    {
      logRecordUid: 'record-1',
      timeUnixNano: '1750000000000000000',
      observedTimeUnixNano: null,
      severityNumber: 9,
      severityText: 'INFO',
      body: 'timeout',
      attributes: {},
      droppedAttributesCount: 0,
      traceId: null,
      spanId: null,
      traceFlags: null,
      resource: {},
      resourceSchemaUrl: null,
      instrumentationScope: null,
      scopeSchemaUrl: null
    }
  ],
  totalElements: 57,
  totalPages: 3,
  number: 2,
  size: 20
};

function renderPanel(
  value: LogExploreQuery,
  evidenceCurrent: boolean,
  openPath: (path: string) => void,
  data: LogHistoryEvidence['page'] = page
) {
  persesContract.rowCount = data.content.length;
  return render(panelView(value, evidenceCurrent, openPath, data, 1, evidenceWindow));
}

function panelView(
  value: LogExploreQuery,
  evidenceCurrent: boolean,
  openPath: (path: string) => void,
  data: LogHistoryEvidence['page'],
  revision: number,
  timeWindow: { from: number; to: number }
) {
  persesContract.rowCount = data.content.length;
  return (
    <I18nextProvider i18n={i18n}>
      <ExplorePersesLogPanel
        data={data}
        statistics={{
          overview: {
            kind: 'ready',
            data: {
              totalCount: 57,
              traceCount: 1,
              debugCount: 0,
              infoCount: 56,
              warnCount: 1,
              errorCount: 0,
              fatalCount: 0
            }
          },
          trend: {
            kind: 'ready',
            data: {
              start: evidenceWindow.from,
              end: evidenceWindow.to,
              intervalMs: 3_600_000,
              buckets: [
                { start: evidenceWindow.from, count: 28 },
                { start: evidenceWindow.from + 3_600_000, count: 29 }
              ]
            }
          }
        }}
        query={value}
        openPath={openPath}
        timeWindow={timeWindow}
        revision={revision}
        evidenceCurrent={evidenceCurrent}
      />
    </I18nextProvider>
  );
}
