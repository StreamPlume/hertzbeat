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
import { useTranslation } from 'react-i18next';

import { OperationalPage, OperationalResultRegion } from '@/shared/operational-page';

import { ExploreQueryBar } from '../components/explore-query-bar';
import { ExploreResultAnnouncer } from '../components/explore-result-announcer';
import { ExploreWorkbench } from '../components/explore-workbench';
import historyStyles from '../components/explore-history-result.module.css';
import workbenchStyles from '../components/explore-workbench.module.css';
import { useExplorePageController } from '../controller/use-explore-page-controller';
import { buildExplorePath } from '../model/explore-model';
import { ExploreFocusedLogPage, ExploreFocusedTracePage } from './explore-focused-investigation';
import { ExploreResultPanel } from './explore-result-panel';

export function ExplorePage() {
  const { t } = useTranslation();
  const controller = useExplorePageController();
  if (controller.investigationRoute.kind === 'trace' && controller.query.signal === 'traces') {
    return (
      <OperationalPage mode="workspace">
        <ExploreFocusedTracePage
          query={controller.query}
          t={t}
          updateQuery={controller.updateQuery}
          time={controller.time}
          openPath={controller.openPath}
        />
      </OperationalPage>
    );
  }
  if (controller.investigationRoute.kind === 'log' && controller.query.signal === 'logs') {
    return (
      <OperationalPage mode="workspace">
        <ExploreFocusedLogPage
          query={controller.query}
          t={t}
          updateQuery={controller.updateQuery}
          time={controller.time}
          openPath={controller.openPath}
        />
      </OperationalPage>
    );
  }
  return <ExploreHistoricalWorkspace controller={controller} t={t} />;
}

function ExploreHistoricalWorkspace({
  controller,
  t
}: {
  controller: ReturnType<typeof useExplorePageController>;
  t: TFunction;
}) {
  const queryBar = (
    <ExploreQueryBar
      query={controller.query}
      t={t}
      updateQuery={controller.updateManualQuery}
      updateScope={controller.updateQuery}
      refresh={controller.refresh}
      time={controller.time}
      submission={controller.submission}
    />
  );
  const resultPanel = (
    <ExploreResultPanel
      query={controller.query}
      result={controller.result}
      retry={controller.refresh}
      openPath={controller.openPath}
    />
  );
  const flatLogs =
    controller.query.signal === 'logs' && controller.result.kind === 'ready' && controller.result.signal === 'logs';
  return (
    <OperationalPage mode="workspace">
      <div className={workbenchStyles.workspace} data-explore-workspace="true" data-layout="continuous">
        <ExploreWorkbench query={controller.query} t={t} updateQuery={controller.updateQuery} />
        <ExploreResultAnnouncer result={controller.result} queryIdentity={buildExplorePath(controller.query)} t={t} />
        <section
          className={workbenchStyles.signalPanel}
          role="tabpanel"
          id={`explore-panel-${controller.query.signal}`}
          aria-labelledby={`explore-tab-${controller.query.signal}`}
          data-layout="continuous"
        >
          {flatLogs ? (
            <>
              <section className={historyStyles.logRegion} data-explore-log-region="query">
                {queryBar}
              </section>
              {resultPanel}
            </>
          ) : (
            <>
              {queryBar}
              <OperationalResultRegion>{resultPanel}</OperationalResultRegion>
            </>
          )}
        </section>
      </div>
    </OperationalPage>
  );
}
