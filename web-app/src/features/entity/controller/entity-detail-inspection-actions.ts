/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import {
  buildEntityExplorePath,
  buildEntityTopologyPath,
  type EntityExploreSignal
} from '../model/entity-operational-navigation';
import { buildEntitySignalHandoffPath, type EntitySignalViewState } from '../model/entity-signal-view-model';
import type { EntityDetailEvidence } from '../model/entity-view-model';

export function buildEntityInspectionActions(
  evidence: EntityDetailEvidence,
  signals: EntitySignalViewState | undefined,
  returnTo: string | null,
  navigate: (path: string) => void
) {
  return {
    explore: (signal: EntityExploreSignal) => {
      if (signals?.kind === 'ready' && signals.capabilities[signal] === 'available') {
        navigate(buildEntitySignalHandoffPath(signals.plan, signal));
        return;
      }
      if (evidence.kind !== 'ready') return;
      navigate(buildEntityExplorePath(evidence.detail, signal));
    },
    topology: () => {
      if (evidence.kind !== 'ready') return;
      const path = buildEntityTopologyPath(evidence.detail, returnTo);
      navigate(signals?.kind === 'ready' ? withExactWindow(path, signals.plan.anchor.window) : path);
    }
  };
}

function withExactWindow(path: string, window: { from: number; to: number }) {
  const url = new URL(path, 'https://hertzbeat.local');
  url.searchParams.set('start', String(window.from));
  url.searchParams.set('end', String(window.to));
  return `${url.pathname}?${url.searchParams.toString()}`;
}
