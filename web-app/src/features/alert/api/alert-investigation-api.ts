/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { apiMessageGet } from '@/core/http/api-message';
import type { ExactTimeWindow } from '@/shared/query-context';

import { parseAlertInvestigation } from './alert-investigation-schema';

export async function loadAlertInvestigation(alertId: number, window: ExactTimeWindow, signal?: AbortSignal) {
  const value = await apiMessageGet(buildAlertInvestigationApiPath(alertId, window), { signal: signal ?? null });
  return parseAlertInvestigation(value, alertId, window);
}

export function buildAlertInvestigationApiPath(alertId: number, window: ExactTimeWindow) {
  if (!Number.isSafeInteger(alertId) || alertId <= 0) throw new Error('Alert identity is invalid');
  if (
    !Number.isSafeInteger(window.from) ||
    !Number.isSafeInteger(window.to) ||
    window.from <= 0 ||
    window.to <= window.from ||
    window.to - window.from > 86_400_000
  ) {
    throw new Error('Alert investigation window is invalid');
  }
  const params = new URLSearchParams({ start: String(window.from), end: String(window.to) });
  return `/api/alerts/${alertId}/investigation?${params.toString()}`;
}
