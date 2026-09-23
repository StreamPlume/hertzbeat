/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import {
  CloseOutlined,
  CopyOutlined,
  ExportOutlined,
  LeftOutlined,
  RightOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LogRow } from '../model/explore-signal-contract';
import { logInspectorFields } from './explore-log-inspector-model';
import styles from './explore-log-inspector.module.css';

type InspectorMode = 'fields' | 'json';
type CopyStatus = 'idle' | 'copied' | 'failed';
type CopyAnnouncement = { status: CopyStatus; owner: string; sequence: number };

const copyStatusKeys = {
  copied: 'explore.perses.logCopied',
  failed: 'explore.perses.logCopyFailed'
} as const;
const COPY_STATUS_DURATION_MS = 4_000;

type Props = {
  id: string;
  row: LogRow;
  selectedIndex: number;
  rowCount: number;
  evidenceCurrent: boolean;
  onSelectIndex: (index: number) => void;
  onInvestigate?: (() => void) | undefined;
  onOpenTrace?: (() => void) | undefined;
  onClose: () => void;
};

export function ExploreLogInspector(props: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<InspectorMode>('fields');
  const [copyAnnouncement, setCopyAnnouncement] = useState<CopyAnnouncement>({
    status: 'idle',
    owner: '',
    sequence: 0
  });
  const copyStatusTimer = useRef<number | undefined>(undefined);
  const json = useMemo(() => JSON.stringify(props.row, null, 2), [props.row]);
  const fields = useMemo(() => logInspectorFields(props.row), [props.row]);
  const canInvestigate = props.evidenceCurrent && props.onInvestigate != null;
  const canOpenTrace = props.evidenceCurrent && props.onOpenTrace != null;
  const copyStatus = copyAnnouncement.owner === json ? copyAnnouncement.status : 'idle';
  const copyStatusMessage = copyStatus === 'idle' ? '' : t(copyStatusKeys[copyStatus]);

  useEffect(
    () => () => {
      if (copyStatusTimer.current != null) window.clearTimeout(copyStatusTimer.current);
    },
    []
  );

  const announceCopy = (status: Exclude<CopyStatus, 'idle'>) => {
    if (copyStatusTimer.current != null) window.clearTimeout(copyStatusTimer.current);
    setCopyAnnouncement(current => ({ status, owner: json, sequence: current.sequence + 1 }));
    copyStatusTimer.current = window.setTimeout(
      () => setCopyAnnouncement(current => (current.owner === json ? { ...current, status: 'idle' } : current)),
      COPY_STATUS_DURATION_MS
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      announceCopy('copied');
    } catch {
      announceCopy('failed');
    }
  };

  return (
    <aside
      id={props.id}
      className={styles.inspector}
      role="dialog"
      aria-modal="false"
      aria-label={t('explore.perses.logInspector')}
      data-card-depth="1"
    >
      <InspectorHeader
        {...props}
        canInvestigate={canInvestigate}
        canOpenTrace={canOpenTrace}
        onCopy={() => void copy()}
      />
      <InspectorModeTabs id={props.id} mode={mode} onModeChange={setMode} />
      <InspectorContent id={props.id} mode={mode} json={json} fields={fields} />
      <span
        key={copyAnnouncement.sequence}
        className={styles.liveStatus}
        role="status"
        aria-label={t('explore.perses.copyStatus')}
        aria-live="polite"
        aria-atomic="true"
      >
        {copyStatusMessage}
      </span>
    </aside>
  );
}

function InspectorHeader(props: Props & { canInvestigate: boolean; canOpenTrace: boolean; onCopy: () => void }) {
  const { t } = useTranslation();
  return (
    <header className={styles.header}>
      <strong>{t('explore.perses.logInspector')}</strong>
      <div className={styles.navigation}>
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined aria-hidden="true" />}
          aria-label={t('explore.perses.previousLog')}
          disabled={props.selectedIndex <= 0}
          onClick={() => props.onSelectIndex(props.selectedIndex - 1)}
        />
        <span
          aria-label={t('explore.perses.selectedLogPosition', {
            current: props.selectedIndex + 1,
            total: props.rowCount
          })}
        >
          {props.selectedIndex + 1} / {props.rowCount}
        </span>
        <Button
          type="text"
          size="small"
          icon={<RightOutlined aria-hidden="true" />}
          aria-label={t('explore.perses.nextLog')}
          disabled={props.selectedIndex >= props.rowCount - 1}
          onClick={() => props.onSelectIndex(props.selectedIndex + 1)}
        />
      </div>
      <div className={styles.actions}>
        <Button
          size="small"
          icon={<CopyOutlined aria-hidden="true" />}
          aria-label={t('explore.perses.copyLog')}
          onClick={props.onCopy}
        />
        <Button
          size="small"
          icon={<SearchOutlined aria-hidden="true" />}
          disabled={!props.canInvestigate}
          onClick={props.onInvestigate}
        >
          {t('explore.perses.investigateLogAction')}
        </Button>
        <Button
          size="small"
          icon={<ExportOutlined aria-hidden="true" />}
          disabled={!props.canOpenTrace}
          onClick={props.onOpenTrace}
        >
          {t('explore.perses.openTraceAction')}
        </Button>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined aria-hidden="true" />}
          aria-label={t('explore.perses.closeInspector')}
          onClick={props.onClose}
        />
      </div>
    </header>
  );
}

function InspectorModeTabs({
  id,
  mode,
  onModeChange
}: {
  id: string;
  mode: InspectorMode;
  onModeChange: (mode: InspectorMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.modeTabs} role="tablist" aria-label={t('explore.perses.inspectorView')}>
      {(['fields', 'json'] as const).map(value => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          aria-controls={`${id}-${value}`}
          id={`${id}-${value}-tab`}
          onClick={() => onModeChange(value)}
        >
          {t(`explore.perses.${value}View`)}
        </button>
      ))}
    </div>
  );
}

function InspectorContent({
  id,
  mode,
  json,
  fields
}: {
  id: string;
  mode: InspectorMode;
  json: string;
  fields: ReturnType<typeof logInspectorFields>;
}) {
  const { t } = useTranslation();
  if (mode === 'json') {
    return (
      <div
        id={`${id}-json`}
        className={styles.content}
        role="tabpanel"
        aria-label={t('explore.perses.jsonView')}
        aria-labelledby={`${id}-json-tab`}
      >
        <pre className={styles.json}>
          <code>{json}</code>
        </pre>
      </div>
    );
  }
  return (
    <div id={`${id}-fields`} className={styles.content} role="tabpanel" aria-labelledby={`${id}-fields-tab`}>
      <dl className={styles.fields}>
        {fields.map(field => (
          <div key={field.key}>
            <dt>{field.key}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
