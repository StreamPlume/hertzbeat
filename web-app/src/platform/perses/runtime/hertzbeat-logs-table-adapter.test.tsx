/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HertzBeatLogsTableAdapter } from './hertzbeat-logs-table-adapter';

describe('HertzBeatLogsTableAdapter', () => {
  afterEach(cleanup);

  it('makes official Perses rows keyboard reachable and reports the selected row without replacing the table', () => {
    const onSelect = vi.fn();
    const view = render(
      <HertzBeatLogsTableAdapter
        ariaLabel="Historical logs"
        controlsId="log-inspector"
        selectedIndex={1}
        getAriaLabel={index => `Log ${index + 1}: checkout timeout`}
        getSeverityLabel={index => (index === 0 ? 'WARN' : 'INFO')}
        onSelect={onSelect}
      >
        <div>
          <div data-log-index="0">
            <span>first</span>
          </div>
          <div data-log-index="1">
            <span>second</span>
          </div>
        </div>
      </HertzBeatLogsTableAdapter>
    );

    const first = screen.getByRole('row', { name: 'Log 1: checkout timeout' });
    const second = screen.getByRole('row', { name: 'Log 2: checkout timeout' });
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('grid', { name: 'Historical logs' })).toContainElement(second);
    expect(screen.getAllByRole('gridcell')).toHaveLength(2);
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(first).toHaveAttribute('aria-haspopup', 'dialog');
    expect(first.firstElementChild).toHaveAttribute('data-hertzbeat-log-severity', 'WARN');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-controls', 'log-inspector');
    expect(view.container.querySelectorAll('[data-log-index]')).toHaveLength(2);

    fireEvent.click(first);
    expect(onSelect).toHaveBeenLastCalledWith(0, first);
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(1, second);
    fireEvent.keyDown(first, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith(0, first);
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
  });

  it('keeps a compact visible time while retaining the full timestamp for assistive and pointer inspection', () => {
    render(
      <HertzBeatLogsTableAdapter
        ariaLabel="Historical logs"
        controlsId="log-inspector"
        getAriaLabel={() => '09/04/2026, 15:18:00 · checkout timeout'}
        onSelect={vi.fn()}
      >
        <div data-log-index="0">
          <div>
            <time dateTime="2026-09-04T15:18:00.123Z">2026-09-04T15:18:00.123Z</time>
            <div>checkout timeout</div>
          </div>
        </div>
      </HertzBeatLogsTableAdapter>
    );

    const time = screen.getByText('09-04 15:18:00.123 UTC');
    expect(time).toHaveAttribute('title', '2026-09-04T15:18:00.123Z');
    expect(time).toHaveAttribute('aria-label', '2026-09-04T15:18:00.123Z');
  });

  it('does not steal nested Perses button interactions', () => {
    const onSelect = vi.fn();
    render(
      <HertzBeatLogsTableAdapter
        ariaLabel="Historical logs"
        controlsId="log-inspector"
        getAriaLabel={() => 'Log row'}
        onSelect={onSelect}
      >
        <div data-log-index="0">
          <button type="button">Copy</button>
        </div>
      </HertzBeatLogsTableAdapter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the restored row as the roving tab stop after selection closes', () => {
    const onSelect = vi.fn<(index: number, row: HTMLElement) => void>();
    const view = render(adapterView(1, onSelect));
    const first = screen.getByRole('row', { name: 'Log 1' });
    const second = screen.getByRole('row', { name: 'Log 2' });
    second.focus();

    view.rerender(adapterView(undefined, onSelect));

    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
  });

  it('resynchronizes accessibility metadata when a virtualized row reuses its element for another index', async () => {
    render(
      <HertzBeatLogsTableAdapter
        ariaLabel="Historical logs"
        controlsId="log-inspector"
        selectedIndex={1}
        getAriaLabel={index => `Log ${index + 1}`}
        onSelect={vi.fn()}
      >
        <div data-log-index="0">reused row</div>
      </HertzBeatLogsTableAdapter>
    );
    const reusedRow = screen.getByRole('row', { name: 'Log 1' });

    reusedRow.setAttribute('data-log-index', '1');

    await waitFor(() => expect(reusedRow).toHaveAccessibleName('Log 2'));
    expect(reusedRow).toHaveAttribute('aria-selected', 'true');
    expect(reusedRow).toHaveAttribute('tabindex', '0');
  });
});

function adapterView(selectedIndex: number | undefined, onSelect: (index: number, row: HTMLElement) => void) {
  return (
    <HertzBeatLogsTableAdapter
      ariaLabel="Historical logs"
      controlsId="log-inspector"
      selectedIndex={selectedIndex}
      getAriaLabel={index => `Log ${index + 1}`}
      onSelect={onSelect}
    >
      <div>
        <div data-log-index="0">first</div>
        <div data-log-index="1">second</div>
      </div>
    </HertzBeatLogsTableAdapter>
  );
}
