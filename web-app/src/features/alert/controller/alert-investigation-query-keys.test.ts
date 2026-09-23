/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import { alertInvestigationQueryKeys } from './alert-investigation-query-keys';

describe('Alert investigation query keys', () => {
  it('owns workspace, alert identity, exact zoned window, and refresh revision', () => {
    expect(
      alertInvestigationQueryKeys.detail('workspace-a', 11, { from: 1_000, to: 2_000, timeZone: 'UTC' }, 3)
    ).toEqual([
      'alert-investigation',
      { workspaceId: 'workspace-a', alertId: 11, window: '1000:2000:UTC', refreshRevision: 3 }
    ]);
  });
});
