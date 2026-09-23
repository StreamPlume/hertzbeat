/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { TFunction } from 'i18next';
import type { KeyboardEvent } from 'react';

import { OperationalPageHeader, OperationalStatePanel } from '@/shared/operational-page';

import {
  exploreHandoffState,
  signalSelectionPatch,
  type ExploreQuery,
  type ExploreQueryPatch,
  type ExploreSignal
} from '../model/explore-model';
import styles from './explore-workbench.module.css';

const signalKeys: ExploreSignal[] = ['metrics', 'logs', 'traces'];

type Props = {
  query: ExploreQuery;
  t: TFunction;
  updateQuery: (changes: ExploreQueryPatch) => void;
};

export function ExploreWorkbench({ query, t, updateQuery }: Props) {
  const handoffState = exploreHandoffState(query);
  const selectSignal = (signal: ExploreSignal) => {
    if (query.signal === signal) return;
    updateQuery(signalSelectionPatch(signal));
  };
  return (
    <>
      <div className={styles.pageHeader} data-explore-page-header="true">
        <OperationalPageHeader title={t('explore.title')} />
      </div>
      {handoffState === 'invalid' && <OperationalStatePanel kind="error" title={t('explore.handoffInvalid')} />}
      <ExploreSignalNavigation query={query} selectSignal={selectSignal} t={t} />
    </>
  );
}

function ExploreSignalNavigation({
  query,
  selectSignal,
  t
}: Pick<Props, 'query' | 't'> & { selectSignal: (signal: ExploreSignal) => void }) {
  return (
    <div className={styles.navigationRow}>
      <nav className={styles.signalNavigation} aria-label={t('explore.signalsNavigation')} role="tablist">
        {signalKeys.map(signal => (
          <button
            key={signal}
            type="button"
            role="tab"
            id={`explore-tab-${signal}`}
            aria-controls={`explore-panel-${signal}`}
            aria-selected={query.signal === signal}
            tabIndex={query.signal === signal ? 0 : -1}
            className={(query.signal === signal ? styles.activeSignal : styles.signal) ?? ''}
            onClick={() => selectSignal(signal)}
            onKeyDown={event => moveSignalFocus(event, signal, selectSignal)}
          >
            {t(`explore.signals.${signal}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}

function moveSignalFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  signal: ExploreSignal,
  selectSignal: (signal: ExploreSignal) => void
) {
  const currentIndex = signalKeys.indexOf(signal);
  const nextIndex = signalNavigationIndex(event.key, currentIndex);
  if (nextIndex == null) return;
  const nextSignal = signalKeys[nextIndex];
  if (!nextSignal) return;
  event.preventDefault();
  event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#explore-tab-${nextSignal}`)?.focus();
  selectSignal(nextSignal);
}

function signalNavigationIndex(key: string, currentIndex: number) {
  if (key === 'Home') return 0;
  if (key === 'End') return signalKeys.length - 1;
  if (key === 'ArrowRight') return (currentIndex + 1) % signalKeys.length;
  if (key === 'ArrowLeft') return (currentIndex - 1 + signalKeys.length) % signalKeys.length;
  return undefined;
}
