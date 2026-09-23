/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Alert, Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';

import { OperationalCommandBar, OperationalPage, OperationalPageHeader } from '@/shared/operational-page';

import type { EntityRecord } from '../model/entity-contract';
import { localizeEntityCode } from '../model/entity-display';
import type { EntityExploreSignal } from '../model/entity-operational-navigation';
import type { EntitySignalViewState } from '../model/entity-signal-view-model';
import { EntityIdentityMetadata } from './entity-detail-metadata';
import { EntitySignalView } from './entity-signal-view';

type DegradedEntityDetailActions = {
  refresh: () => void;
  back: () => void;
  edit: () => void;
  definition: () => void;
  explore: (signal: EntityExploreSignal) => void;
  topology: () => void;
  remove: () => void;
};

export function DegradedEntityDetail({
  entity,
  state,
  actions,
  signals
}: {
  entity: EntityRecord;
  state: { deleting: boolean; refreshing: boolean; canWrite: boolean; canDelete: boolean };
  actions: DegradedEntityDetailActions;
  signals?: EntitySignalViewState | undefined;
}) {
  const { t } = useTranslation();
  return (
    <OperationalPage>
      <OperationalPageHeader
        title={entity.displayName || entity.name}
        description={localizeEntityCode(t, 'type', entity.type)}
        actions={
          <Space wrap>
            <Button disabled={state.refreshing} loading={state.refreshing} onClick={actions.refresh}>
              {t('common.refresh')}
            </Button>
            <Button onClick={actions.back}>{t('common.back')}</Button>
          </Space>
        }
      />
      <OperationalCommandBar
        primary={
          state.canWrite ? (
            <Space wrap>
              <Button type="primary" onClick={actions.edit}>
                {t('common.edit')}
              </Button>
              <Button onClick={actions.definition}>{t('entity.definition.action')}</Button>
            </Space>
          ) : undefined
        }
        secondary={
          state.canDelete ? (
            <Button danger disabled={state.deleting} loading={state.deleting} onClick={actions.remove}>
              {t('entity.delete.action')}
            </Button>
          ) : undefined
        }
      />
      <Alert
        showIcon
        type="warning"
        message={t('entity.degraded.title')}
        description={t('entity.degraded.description')}
      />
      {signals ? (
        <EntitySignalView state={signals} openSignal={actions.explore} openTopology={actions.topology} />
      ) : null}
      <EntityIdentityMetadata entity={entity} />
    </OperationalPage>
  );
}
