/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

import styles from './entity-signal-view.module.css';

export function EntitySignalSection({
  title,
  action,
  compact,
  children
}: {
  title: string;
  action?: (() => void) | undefined;
  compact?: boolean | undefined;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={title} className={`${styles.signalSection} ${compact ? styles.compactSection : ''}`}>
      <header className={styles.sectionHeader}>
        <h2>{title}</h2>
        {action ? <Button onClick={action}>{t('entity.signals.openExplore')}</Button> : null}
      </header>
      {children}
    </section>
  );
}
