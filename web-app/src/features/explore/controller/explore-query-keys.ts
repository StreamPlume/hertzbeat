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

import { scopedQueryKey, type ExactTimeWindow, type QueryContext } from '@/shared/query-context';

import { exploreQueryContext, exploreUsesExactWindow, type ExploreQuery } from '../model/explore-model';

const historyRootKey = ['explore-history'] as const;

export const exploreQueryKeys = {
  traceInvestigation: (
    context: QueryContext,
    window: ExactTimeWindow,
    traceId: string,
    spanId: string | undefined,
    refreshRevision: number
  ) =>
    [
      ...scopedQueryKey(['explore-investigation', 'trace'], context, window, refreshRevision),
      { traceId, spanId }
    ] as const,
  logInvestigation: (context: QueryContext, window: ExactTimeWindow, logRecordUid: string, refreshRevision: number) =>
    [...scopedQueryKey(['explore-investigation', 'log'], context, window, refreshRevision), { logRecordUid }] as const,
  history: (query: ExploreQuery, window: ExactTimeWindow | undefined, refreshRevision: number) =>
    [
      ...scopedQueryKey(historyRootKey, exploreQueryContext(query), window, refreshRevision),
      ...historyRequestIdentity(query)
    ] as const
};

function historyRequestIdentity(query: ExploreQuery) {
  // An exact window owns the request timestamps; the route preset matters only for a relative request.
  const relativeTimeRange = exploreUsesExactWindow(query) ? undefined : query.timeRange;
  if (query.signal === 'metrics')
    return [
      'metrics',
      {
        relativeTimeRange,
        query: query.query,
        operationName: query.operationName,
        metricFilter: query.metricFilter,
        groupBy: query.groupBy,
        aggregation: query.aggregation,
        temporalAggregation: query.temporalAggregation,
        step: query.step
      }
    ] as const;
  if (query.signal === 'logs')
    return [
      'logs',
      {
        relativeTimeRange,
        query: query.query,
        traceId: query.traceId,
        spanId: query.spanId,
        severityText: query.severityText,
        resourceFilter: query.resourceFilter,
        attributeFilter: query.attributeFilter,
        hideInternal: query.hideInternal,
        hideNoise: query.hideNoise,
        pageIndex: query.pageIndex
      }
    ] as const;
  return [
    'traces',
    {
      relativeTimeRange,
      query: query.query,
      traceId: query.traceId,
      resourceFilter: query.resourceFilter,
      attributeFilter: query.attributeFilter,
      minDurationMs: query.minDurationMs,
      maxDurationMs: query.maxDurationMs,
      errorOnly: query.errorOnly,
      spanScope: query.spanScope,
      hideInternal: query.hideInternal,
      pageIndex: query.pageIndex
    }
  ] as const;
}
