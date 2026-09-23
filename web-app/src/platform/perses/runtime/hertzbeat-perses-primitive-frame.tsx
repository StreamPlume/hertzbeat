/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Component, lazy, Suspense, useState, type ReactNode } from 'react';

import type { ExactTimeWindow } from '@/shared/query-context';

import type { HertzBeatQueryFailure, HertzBeatQueryOutcome } from '../datasource/hertzbeat-query-contract';
import { PersesSignalDataError } from './perses-signal-data';
import { loadPersesRuntime } from './perses-runtime-registry';
import type { HertzBeatLogRowSelection } from './hertzbeat-logs-table-adapter';
import styles from './hertzbeat-perses-primitives.module.css';

type FailureMessageKey = HertzBeatQueryFailure['messageKey'];

export type HertzBeatPersesPrimitiveMessages = {
  loading: ReactNode;
  empty: ReactNode;
  truncated: ReactNode;
  truncationUnknown: ReactNode;
  runtimeError: ReactNode;
  investigationActions: (count: number) => ReactNode;
  failures: Record<FailureMessageKey, ReactNode>;
};

export type HertzBeatPersesTableInteraction = {
  key: string;
  label: ReactNode;
  actions: Array<{
    label: string;
    ariaLabel?: string | undefined;
    disabled?: boolean | undefined;
    onAction: () => void;
  }>;
};

export type SharedPrimitiveProps = {
  title: string;
  ariaLabel: string;
  messages: HertzBeatPersesPrimitiveMessages;
  className?: string | undefined;
  runtimeIdentity?: string | undefined;
  interactions?: HertzBeatPersesTableInteraction[] | undefined;
  onTimeWindowChange?: ((window: ExactTimeWindow) => void) | undefined;
  timeWindowChangeEnabled?: boolean | undefined;
  timeSeriesDisplay?: 'line' | 'bar' | undefined;
  variant?: 'default' | 'compact' | undefined;
  logDisplay?: HertzBeatLogTableDisplay | undefined;
  logRowSelection?: HertzBeatLogRowSelection | undefined;
};

export type HertzBeatLogTableDisplay = {
  density: 'compact' | 'comfortable';
  wrap: boolean;
  showTime: boolean;
};

export type PrimitiveState<T> =
  { kind: 'loading'; queryKey: string } | { kind: 'resolved'; queryKey: string; outcome: HertzBeatQueryOutcome<T> };
export type ReadyOutcome<T> = Extract<HertzBeatQueryOutcome<T>, { state: 'ready' }>;
export type HertzBeatPrimitiveFrameProps<T> = SharedPrimitiveProps & {
  state: PrimitiveState<T>;
  toRuntimeProps: (outcome: ReadyOutcome<T>) => SignalRuntimeProps;
};

async function loadPersesSignalRuntime() {
  const module = await loadPersesRuntime('multi-signal');
  return { default: module.PersesSignalRuntime };
}

async function loadPersesTimeSeriesRuntime() {
  const module = await loadPersesRuntime('time-series');
  return { default: module.PersesTimeSeriesRuntime };
}

const PersesSignalRuntime = lazy(loadPersesSignalRuntime);
const PersesTimeSeriesRuntime = lazy(loadPersesTimeSeriesRuntime);
type SignalRuntimeProps = React.ComponentProps<typeof PersesSignalRuntime>;

export function HertzBeatPrimitiveFrame<T>({ state, toRuntimeProps, ...props }: HertzBeatPrimitiveFrameProps<T>) {
  const className = [styles.primitive, props.className].filter(Boolean).join(' ');
  if (state.kind === 'loading') return <PrimitiveStateFrame {...props}>{props.messages.loading}</PrimitiveStateFrame>;
  const { outcome } = state;
  if (outcome.state === 'empty') return <PrimitiveStateFrame {...props}>{props.messages.empty}</PrimitiveStateFrame>;
  if (outcome.state === 'error') {
    return (
      <PrimitiveStateFrame {...props} alert>
        {props.messages.failures[outcome.error.messageKey]}
      </PrimitiveStateFrame>
    );
  }
  let runtimeProps: SignalRuntimeProps;
  try {
    runtimeProps = toRuntimeProps(outcome);
  } catch (error) {
    if (!(error instanceof PersesSignalDataError)) throw error;
    return (
      <PrimitiveStateFrame {...props} alert>
        {props.messages.failures['perses.query.contract']}
      </PrimitiveStateFrame>
    );
  }
  const runtimeRole = runtimeProps.kind === 'metric-time-series' ? 'img' : 'region';
  return (
    <div
      className={className}
      data-visualization-runtime="perses"
      data-variant={props.variant ?? 'default'}
      data-log-density={props.logDisplay?.density}
      data-log-wrap={props.logDisplay?.wrap}
      data-log-show-time={props.logDisplay?.showTime}
    >
      <PersesPrimitiveErrorBoundary
        ariaLabel={props.ariaLabel}
        fallback={props.messages.runtimeError}
        resetKey={state.queryKey}
      >
        <div className={styles.runtime} role={runtimeRole} aria-label={props.ariaLabel}>
          <Suspense fallback={<div className={styles.state}>{props.messages.loading}</div>}>
            {runtimeProps.kind === 'metric-time-series' ? (
              <PersesTimeSeriesRuntime {...runtimeProps} />
            ) : (
              <PersesSignalRuntime {...runtimeProps} />
            )}
          </Suspense>
        </div>
      </PersesPrimitiveErrorBoundary>
      <Completeness ariaLabel={props.ariaLabel} truncated={outcome.truncated} messages={props.messages} />
      <PersesHostInteractions interactions={props.interactions} messages={props.messages} />
    </div>
  );
}

function PrimitiveStateFrame(props: SharedPrimitiveProps & { alert?: boolean; children: ReactNode }) {
  const className = [styles.primitive, props.className].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      role={props.alert ? 'alert' : 'status'}
      aria-label={props.ariaLabel}
      data-variant={props.variant ?? 'default'}
    >
      <div className={styles.state}>{props.children}</div>
    </div>
  );
}

function PersesHostInteractions({
  interactions,
  messages
}: {
  interactions?: HertzBeatPersesTableInteraction[] | undefined;
  messages: HertzBeatPersesPrimitiveMessages;
}) {
  const [open, setOpen] = useState(false);
  if (!interactions?.length) return null;
  return (
    <details className={styles.interactions} data-perses-host-interactions open={open}>
      <summary
        onClick={event => {
          event.preventDefault();
          setOpen(current => !current);
        }}
      >
        {messages.investigationActions(interactions.length)}
      </summary>
      {open && (
        <ul className={styles.interactionList}>
          {interactions.map(interaction => (
            <li key={interaction.key}>
              <span>{interaction.label}</span>
              <div>
                {interaction.actions.map(action => (
                  <button
                    key={action.label}
                    type="button"
                    aria-label={action.ariaLabel}
                    disabled={action.disabled}
                    onClick={action.onAction}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Completeness(props: {
  ariaLabel: string;
  truncated: boolean | 'unknown';
  messages: HertzBeatPersesPrimitiveMessages;
}) {
  if (props.truncated === false) return null;
  return (
    <div className={styles.completeness} role="status" aria-label={`${props.ariaLabel} completeness`}>
      {props.truncated === true ? props.messages.truncated : props.messages.truncationUnknown}
    </div>
  );
}

class PersesPrimitiveErrorBoundary extends Component<
  { ariaLabel: string; fallback: ReactNode; resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps: Readonly<typeof this.props>) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={styles.state} role="alert" aria-label={this.props.ariaLabel}>
          {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}
