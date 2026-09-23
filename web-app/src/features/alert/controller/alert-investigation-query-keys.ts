/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { InvestigationTimeWindow } from '@/shared/query-context';

export const alertInvestigationQueryKeys = {
  detail: (workspaceId: string, alertId: number, window: InvestigationTimeWindow, refreshRevision: number) =>
    [
      'alert-investigation',
      { workspaceId, alertId, window: `${window.from}:${window.to}:${window.timeZone}`, refreshRevision }
    ] as const
};
