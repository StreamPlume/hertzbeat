/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, initializeI18n, loadLocale } from '@/core/i18n/i18n';

import type { LogRow } from '../model/explore-signal-contract';
import { ExploreLogInspector } from './explore-log-inspector';

const writeText = vi.fn<(value: string) => Promise<void>>();

describe('ExploreLogInspector', () => {
  beforeAll(async () => {
    await initializeI18n();
    await loadLocale('en-US');
  });
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });
  afterEach(cleanup);

  it('renders one flat inspector surface with row navigation, Fields/JSON, and real evidence actions', async () => {
    const openPath = vi.fn();
    const onSelectIndex = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogInspector
          id="log-inspector"
          row={row}
          selectedIndex={1}
          rowCount={3}
          evidenceCurrent
          onSelectIndex={onSelectIndex}
          onInvestigate={() => {
            openPath('/explore?logRecordUid=record-1');
          }}
          onOpenTrace={() => {
            openPath('/explore?traceId=0123');
          }}
          onClose={onClose}
        />
      </I18nextProvider>
    );

    const inspector = screen.getByRole('dialog', { name: 'Log inspector' });
    expect(inspector).toHaveAttribute('aria-modal', 'false');
    expect(inspector).toHaveAttribute('data-card-depth', '1');
    expect(inspector.querySelector('[data-card-depth="2"]')).not.toBeInTheDocument();
    expect(within(inspector).getByText('resource.service.name')).toBeInTheDocument();
    expect(within(inspector).getByText('checkout')).toBeInTheDocument();

    fireEvent.click(within(inspector).getByRole('button', { name: 'Previous log' }));
    expect(onSelectIndex).toHaveBeenCalledWith(0);
    fireEvent.click(within(inspector).getByRole('button', { name: 'Next log' }));
    expect(onSelectIndex).toHaveBeenCalledWith(2);

    fireEvent.click(within(inspector).getByRole('tab', { name: 'JSON' }));
    expect(within(inspector).getByRole('tabpanel', { name: 'JSON' })).toHaveTextContent('"logRecordUid": "record-1"');
    fireEvent.click(within(inspector).getByRole('button', { name: 'Copy log' }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(row, null, 2));
    expect(await within(inspector).findByText('Log copied')).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(within(inspector).getByRole('button', { name: 'Investigate' }));
    fireEvent.click(within(inspector).getByRole('button', { name: 'Open trace' }));
    expect(openPath).toHaveBeenCalledTimes(2);
    fireEvent.click(within(inspector).getByRole('button', { name: 'Close inspector' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(view.container.querySelector('.ant-card')).not.toBeInTheDocument();
  });

  it('bounds copy announcements and does not leave stale success text in the accessibility tree', async () => {
    vi.useFakeTimers();
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogInspector
          id="log-inspector"
          row={row}
          selectedIndex={0}
          rowCount={1}
          evidenceCurrent
          onSelectIndex={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy log' }));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('status', { name: 'Copy status' })).toHaveTextContent('Log copied');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByRole('status', { name: 'Copy status' })).toBeEmptyDOMElement();
    vi.useRealTimers();
  });

  it('keeps unavailable actions disabled for stale evidence or missing identifiers', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogInspector
          id="log-inspector"
          row={{ ...row, logRecordUid: null, traceId: null }}
          selectedIndex={0}
          rowCount={1}
          evidenceCurrent={false}
          onSelectIndex={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('button', { name: 'Previous log' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next log' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Investigate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open trace' })).toBeDisabled();
  });

  it('announces a localized failure when copying is unavailable', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    render(
      <I18nextProvider i18n={i18n}>
        <ExploreLogInspector
          id="log-inspector"
          row={row}
          selectedIndex={0}
          rowCount={1}
          evidenceCurrent
          onSelectIndex={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy log' }));

    expect(await screen.findByText('Log could not be copied')).toHaveAttribute('aria-live', 'polite');
  });
});

const row: LogRow = {
  logRecordUid: 'record-1',
  timeUnixNano: '1750000000000000000',
  observedTimeUnixNano: '1750000000100000000',
  severityNumber: 9,
  severityText: 'INFO',
  body: 'checkout timeout',
  attributes: { 'http.status_code': 504 },
  droppedAttributesCount: 0,
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef',
  traceFlags: 1,
  resource: { 'service.name': 'checkout' },
  resourceSchemaUrl: null,
  instrumentationScope: { name: 'io.opentelemetry', version: '1.0.0', attributes: null, droppedAttributesCount: 0 },
  scopeSchemaUrl: null
};
