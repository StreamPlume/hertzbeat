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

import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { loadLogHistoryEvidence, loadMetricSignal, loadTraceSignal } from '../api/explore-api';
import type { ExploreQuery } from '../model/explore-model';
import { timeRangeMilliseconds } from '../model/explore-model';
import type { HistoricalEvidence } from '../model/explore-result-model';
import { exploreQueryKeys } from './explore-query-keys';

type ExactWindow = { from: number; to: number } | undefined;

export function useExploreHistory(query: ExploreQuery, window: ExactWindow, enabled: boolean, refreshRevision: number) {
  const evidenceOwner = useMemo(
    () => requireHistoryEvidenceOwner(exploreQueryKeys.history(query, window, 0)),
    [query, window]
  );
  const queryClient = useQueryClient();
  const queryResult = useQuery({
    ...historyQueryOptions(query, window, refreshRevision),
    enabled,
    placeholderData: (previous, previousQuery) =>
      previousQuery && historyEvidenceOwnerFromKey(previousQuery.queryKey) === evidenceOwner ? previous : undefined
  });
  const retainedEvidence = latestHistoryEvidence(queryClient, evidenceOwner, query.signal);
  // A failed refresh generation drops placeholderData, so retention is explicitly bounded by the stable request owner.
  const evidence = queryResult.data ?? retainedEvidence;
  return { queryResult, evidence };
}

function historyQueryOptions(query: ExploreQuery, window: ExactWindow, refreshRevision: number) {
  return queryOptions({
    queryKey: exploreQueryKeys.history(query, window, refreshRevision),
    queryFn: ({ signal }) => loadHistorical(query, window, refreshRevision, signal),
    retry: false,
    staleTime: 0
  });
}

function requireHistoryEvidenceOwner(queryKey: readonly unknown[]) {
  const owner = historyEvidenceOwnerFromKey(queryKey);
  if (!owner) throw new Error('Explore history key does not carry an evidence owner');
  return owner;
}

function historyEvidenceOwnerFromKey(queryKey: readonly unknown[]) {
  const generation = queryKey[1];
  if (
    queryKey[0] !== 'explore-history' ||
    generation == null ||
    typeof generation !== 'object' ||
    !('refreshRevision' in generation)
  )
    return undefined;
  const request = queryKey.at(-1);
  const relative =
    request && typeof request === 'object' && 'relativeTimeRange' in request && request.relativeTimeRange;
  const scoped = generation as { context?: unknown; window?: unknown; refreshRevision: unknown };
  return JSON.stringify([
    queryKey[0],
    { ...scoped, window: relative ? 'none' : scoped.window, refreshRevision: 0 },
    ...queryKey.slice(2)
  ]);
}

function latestHistoryEvidence(queryClient: QueryClient, owner: string, signal: ExploreQuery['signal']) {
  const matches = queryClient.getQueriesData<HistoricalEvidence>({
    predicate: candidate => historyEvidenceOwnerFromKey(candidate.queryKey) === owner
  });
  return matches.reduce<{ revision: number; evidence?: HistoricalEvidence }>(
    (latest, [queryKey, evidence]) => {
      const revision = historyRefreshRevisionFromKey(queryKey);
      if (revision === undefined || revision <= latest.revision || evidence?.signal !== signal) return latest;
      return { revision, evidence };
    },
    { revision: -1 }
  ).evidence;
}

function historyRefreshRevisionFromKey(queryKey: readonly unknown[]) {
  const generation = queryKey[1];
  if (generation == null || typeof generation !== 'object' || !('refreshRevision' in generation)) return undefined;
  const revision = generation.refreshRevision;
  return Number.isSafeInteger(revision) && Number(revision) >= 0 ? Number(revision) : undefined;
}

async function loadHistorical(
  query: ExploreQuery,
  requestedWindow: ExactWindow,
  revision: number,
  signal: AbortSignal
): Promise<HistoricalEvidence> {
  const window = requestedWindow ?? captureWindow(query);
  const scopedQuery = { ...query, start: window.from, end: window.to, windowMode: undefined };
  if (scopedQuery.signal === 'metrics') {
    return { signal: 'metrics', data: await loadMetricSignal(scopedQuery, signal), window, revision };
  }
  if (scopedQuery.signal === 'logs') {
    return { signal: 'logs', data: await loadLogHistoryEvidence(scopedQuery, signal), window, revision };
  }
  return { signal: 'traces', data: await loadTraceSignal(scopedQuery, signal), window, revision };
}

function captureWindow(query: ExploreQuery) {
  if (query.start != null && query.end != null && query.start < query.end) return { from: query.start, to: query.end };
  const to = Date.now();
  return { from: to - timeRangeMilliseconds(query.timeRange), to };
}
