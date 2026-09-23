/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { useCallback, useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import styles from './hertzbeat-logs-table-adapter.module.css';

export type HertzBeatLogRowSelection = {
  ariaLabel: string;
  controlsId: string;
  selectedIndex?: number | undefined;
  getAriaLabel: (index: number) => string;
  getSeverityLabel?: ((index: number) => string | undefined) | undefined;
  onSelect: (index: number, row: HTMLElement) => void;
};

export function HertzBeatLogsTableAdapter({
  children,
  ariaLabel,
  controlsId,
  selectedIndex,
  getAriaLabel,
  getSeverityLabel,
  onSelect
}: HertzBeatLogRowSelection & { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rovingIndexRef = useRef<number | undefined>(selectedIndex);

  const synchronizeRows = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-log-index]'));
    const rovingIndex = resolveRovingIndex(rows, selectedIndex, rovingIndexRef.current);
    rovingIndexRef.current = rovingIndex;
    for (const row of rows) {
      const index = logIndex(row);
      if (index == null) continue;
      decorateRow(row, index, index === rovingIndex, selectedIndex === index, {
        controlsId,
        ariaLabel: getAriaLabel(index),
        severityLabel: getSeverityLabel?.(index)
      });
    }
  }, [controlsId, getAriaLabel, getSeverityLabel, selectedIndex]);

  useEffect(() => {
    synchronizeRows();
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new MutationObserver(synchronizeRows);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-log-index', 'datetime'],
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, [synchronizeRows]);

  const selectFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest(interactiveSelector)) return;
    const row = target.closest<HTMLElement>('[data-log-index]');
    const index = row ? logIndex(row) : undefined;
    if (row && index != null) {
      rovingIndexRef.current = index;
      setRovingFocus(rootRef.current, row);
      onSelect(index, row);
    }
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => selectFromTarget(event.target);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-log-index]')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectFromTarget(target);
      return;
    }
    const movement = keyboardMovement(event.key);
    if (movement == null) return;
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-log-index]') ?? []);
    const current = rows.indexOf(target);
    const next = movement === 'first' ? 0 : movement === 'last' ? rows.length - 1 : current + movement;
    const row = rows[Math.max(0, Math.min(rows.length - 1, next))];
    if (!row) return;
    event.preventDefault();
    rovingIndexRef.current = logIndex(row);
    setRovingFocus(rootRef.current, row);
    row.focus();
  };

  return (
    <div
      ref={rootRef}
      className={styles.adapter}
      role="grid"
      aria-label={ariaLabel}
      aria-multiselectable="false"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

const interactiveSelector = 'button, a, input, select, textarea, [role="button"], [role="link"]';

function logIndex(row: HTMLElement) {
  const value = row.dataset.logIndex;
  if (value == null || !/^\d+$/u.test(value)) return undefined;
  const index = Number(value);
  return Number.isSafeInteger(index) ? index : undefined;
}

function resolveRovingIndex(rows: HTMLElement[], selectedIndex: number | undefined, rovingIndex: number | undefined) {
  if (selectedIndex != null && rows.some(row => logIndex(row) === selectedIndex)) return selectedIndex;
  if (rovingIndex != null && rows.some(row => logIndex(row) === rovingIndex)) return rovingIndex;
  const firstRow = rows[0];
  return firstRow ? logIndex(firstRow) : undefined;
}

function setAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value == null) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
    return;
  }
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function decorateRow(
  row: HTMLElement,
  index: number,
  roving: boolean,
  selected: boolean,
  details: { controlsId: string; ariaLabel: string; severityLabel: string | undefined }
) {
  setAttribute(row, 'role', 'row');
  setAttribute(row, 'tabindex', roving ? '0' : '-1');
  setAttribute(row, 'aria-label', details.ariaLabel);
  setAttribute(row, 'aria-selected', String(selected));
  setAttribute(row, 'aria-expanded', String(selected));
  setAttribute(row, 'aria-haspopup', 'dialog');
  setAttribute(row, 'aria-controls', selected ? details.controlsId : null);
  setAttribute(row, 'data-hertzbeat-log-trigger', 'true');
  setAttribute(row, 'data-hertzbeat-selected', selected ? 'true' : null);
  const content = row.firstElementChild;
  if (content instanceof HTMLElement) {
    setAttribute(content, 'data-hertzbeat-log-severity', details.severityLabel?.trim() || null);
    formatVisibleTimestamp(content.querySelector('time'));
  }
  for (const cell of row.children) {
    if (cell instanceof HTMLElement && !cell.matches(interactiveSelector)) setAttribute(cell, 'role', 'gridcell');
  }
}

function setRovingFocus(root: HTMLElement | null, selected: HTMLElement) {
  if (!root) return;
  for (const row of root.querySelectorAll<HTMLElement>('[data-log-index]')) row.tabIndex = row === selected ? 0 : -1;
}

function formatVisibleTimestamp(time: HTMLTimeElement | null) {
  const fullTimestamp = time?.dateTime;
  if (!time || !fullTimestamp) return;
  const compactTimestamp = /^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}\.\d{3})Z$/u.exec(fullTimestamp);
  if (!compactTimestamp) return;
  const visible = `${compactTimestamp[1]} ${compactTimestamp[2]} UTC`;
  setAttribute(time, 'title', fullTimestamp);
  setAttribute(time, 'aria-label', fullTimestamp);
  if (time.textContent !== visible) time.textContent = visible;
}

function keyboardMovement(key: string): -1 | 1 | 'first' | 'last' | undefined {
  if (key === 'ArrowUp') return -1;
  if (key === 'ArrowDown') return 1;
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  return undefined;
}
