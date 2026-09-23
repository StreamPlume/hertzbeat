/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { skipToken, useQuery } from '@tanstack/react-query';

import { useSharedTimeOptional } from '@/shared/time';

import { loadTraceInvestigation } from '../api/explore-investigation-api';
import { ExploreInvestigationContractError } from '../api/explore-investigation-schema';
import type { TraceInvestigationViewState } from '../model/explore-investigation-contract';
import { exploreInvestigationRoute } from '../model/explore-investigation-model';
import { createTraceInvestigationPersesResults } from '../model/explore-investigation-perses-model';
import { exploreQueryContext, type TraceExploreQuery } from '../model/explore-model';
import { exploreQueryKeys } from './explore-query-keys';

export function useTraceInvestigationController(query: TraceExploreQuery) {
  const route = exploreInvestigationRoute(query);
  const traceRoute = route.kind === 'trace' ? route : undefined;
  const refreshRevision = useSharedTimeOptional()?.refreshRevision ?? 0;
  const request = useQuery({
    queryKey: traceRoute
      ? exploreQueryKeys.traceInvestigation(
          exploreQueryContext(query),
          traceRoute.window,
          traceRoute.traceId,
          traceRoute.spanId,
          refreshRevision
        )
      : ['explore-investigation', 'trace', 'inactive'],
    queryFn: traceRoute
      ? ({ signal }) => loadTraceInvestigation(traceRoute.traceId, traceRoute.spanId, traceRoute.window, signal)
      : skipToken,
    retry: false,
    staleTime: 30_000
  });
  return {
    state: traceInvestigationState(query, route, request),
    refetch: () => (traceRoute ? request.refetch().then(() => undefined) : Promise.resolve())
  };
}

function traceInvestigationState(
  query: TraceExploreQuery,
  route: ReturnType<typeof exploreInvestigationRoute>,
  request: {
    data?: Awaited<ReturnType<typeof loadTraceInvestigation>> | undefined;
    error: Error | null;
  }
): TraceInvestigationViewState {
  if (route.kind === 'inactive') return { kind: 'inactive' };
  if (route.kind !== 'trace') return { kind: 'invalid' };
  if (request.error) {
    return {
      kind: request.error instanceof ExploreInvestigationContractError ? 'contract_error' : 'unavailable',
      route
    };
  }
  if (!request.data) return { kind: 'loading', route };
  return {
    kind: 'ready',
    route,
    snapshot: request.data,
    perses: createTraceInvestigationPersesResults(query, request.data)
  };
}
