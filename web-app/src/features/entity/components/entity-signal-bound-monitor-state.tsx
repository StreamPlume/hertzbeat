/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { useTranslation } from 'react-i18next';

import type { EntitySignalViewState } from '../model/entity-signal-view-model';
import styles from './entity-signal-view.module.css';

type BoundMonitorState = Extract<EntitySignalViewState, { kind: 'ready' }>['boundMonitors'];

export function EntitySignalBoundMonitorState({ state }: { state: BoundMonitorState }) {
  const { t } = useTranslation();
  if (state.state === 'unknown') {
    return <div className={styles.compactState}>{t('entity.signals.boundMonitorsState.unknown')}</div>;
  }
  if (state.total === 0) {
    return <div className={styles.compactState}>{t('entity.signals.boundMonitorsState.empty')}</div>;
  }
  return (
    <div className={styles.nameList}>
      <strong>{t('entity.signals.items', { count: state.total })}</strong>
      {state.names.map(name => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}
