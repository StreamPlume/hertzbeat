/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import type { TFunction } from 'i18next';

import type { HertzBeatPersesPrimitiveMessages } from '@/platform/perses';

export function explorePersesMessages(t: TFunction): HertzBeatPersesPrimitiveMessages {
  return {
    loading: t('explore.perses.loading'),
    empty: t('explore.perses.empty'),
    truncated: t('explore.perses.truncated'),
    truncationUnknown: t('explore.perses.truncationUnknown'),
    runtimeError: t('explore.perses.runtimeError'),
    investigationActions: count => t('explore.perses.investigationActions', { count }),
    failures: {
      'perses.query.invalid': t('explore.perses.invalid'),
      'perses.query.permission': t('explore.perses.permission'),
      'perses.query.overloaded': t('explore.perses.overloaded'),
      'perses.query.unavailable': t('explore.perses.unavailable'),
      'perses.query.contract': t('explore.perses.contract')
    }
  };
}
