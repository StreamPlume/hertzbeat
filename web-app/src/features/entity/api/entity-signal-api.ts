/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { apiMessageGet } from '@/core/http/api-message';
import type { ExactTimeWindow } from '@/shared/query-context';

import { EntityRedSignalContractError, parseEntityRedSignal } from './entity-signal-schema';

const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;

export async function loadEntityRedSignal(id: number, window: ExactTimeWindow, signal?: AbortSignal) {
  if (!Number.isSafeInteger(id) || id <= 0 || !validWindow(window)) throw new EntityRedSignalContractError();
  const value = await apiMessageGet(
    `/api/entities/${id}/signals/red?start=${window.from}&end=${window.to}`,
    signal ? { signal } : undefined
  );
  return parseEntityRedSignal(value, id, window);
}

function validWindow(window: ExactTimeWindow) {
  return (
    Number.isSafeInteger(window.from) &&
    Number.isSafeInteger(window.to) &&
    window.from > 0 &&
    window.from < window.to &&
    window.to - window.from <= MAX_WINDOW_MS
  );
}
