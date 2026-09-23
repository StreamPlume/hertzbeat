/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { Button, Descriptions } from 'antd';
import { useTranslation } from 'react-i18next';

import {
  HertzBeatTracingGanttChartResult,
  type HertzBeatPersesPrimitiveMessages,
  type HertzBeatTraceGanttQueryOutcome
} from '@/platform/perses';

import type { InvestigationPersesResults } from '../model/explore-investigation-contract';
import { investigationDurationNanoToMillis } from '../model/explore-investigation-model';
import traceStyles from './explore-investigation-trace.module.css';
import viewStyles from './explore-investigation-view.module.css';
import { OtlpAttributeSection } from './otlp-attribute-list';
import { formatTraceDuration } from './trace-display';

type GanttPanel = NonNullable<InvestigationPersesResults['gantt']> & {
  outcome: Extract<HertzBeatTraceGanttQueryOutcome, { state: 'ready' }>;
};
type TraceDetail = GanttPanel['outcome']['data'];

export function InvestigationTracePrimary({
  panel,
  selectedSpanId,
  evidenceCurrent,
  messages,
  onSelectSpan
}: {
  panel: GanttPanel;
  selectedSpanId?: string | undefined;
  evidenceCurrent: boolean;
  messages: HertzBeatPersesPrimitiveMessages;
  onSelectSpan: (spanId: string) => void;
}) {
  const { t } = useTranslation();
  const detail = panel.outcome.data;
  const spans = detail.spans ?? [];
  const selected = spans.find(span => span.spanId === selectedSpanId) ?? spans[0];
  return (
    <div className={traceStyles.traceBody}>
      <TraceSummary detail={detail} spanCount={spans.length} />
      <div className={traceStyles.tracePrimary}>
        <HertzBeatTracingGanttChartResult
          className={traceStyles.ganttRuntime}
          title={detail.rootSpanName ?? t('exploreInvestigation.sections.traces')}
          ariaLabel={t('exploreInvestigation.sections.traces')}
          messages={messages}
          query={panel.query}
          outcome={panel.outcome}
        />
        <aside className={traceStyles.spanInspector} aria-label={t('exploreInvestigation.trace.spanInspector')}>
          <div className={traceStyles.spanList}>
            {spans.map(span => (
              <Button
                key={span.spanId ?? span.spanName ?? 'span'}
                type={span.spanId === selected?.spanId ? 'primary' : 'text'}
                disabled={!evidenceCurrent || !span.spanId}
                onClick={() => {
                  if (span.spanId) onSelectSpan(span.spanId);
                }}
              >
                <strong>{span.serviceName ?? '—'}</strong>
                <span>{span.spanName ?? '—'}</span>
              </Button>
            ))}
          </div>
          {selected ? <SelectedSpanDetail span={selected} /> : <p>{t('exploreInvestigation.trace.selectSpan')}</p>}
        </aside>
      </div>
    </div>
  );
}

function TraceSummary({ detail, spanCount }: { detail: TraceDetail; spanCount: number }) {
  const { t } = useTranslation();
  const duration = detail.durationNanos == null ? undefined : investigationDurationNanoToMillis(detail.durationNanos);
  return (
    <dl className={traceStyles.traceSummary} aria-label={t('exploreInvestigation.trace.summary')}>
      <SummaryFact label={t('exploreInvestigation.trace.traceId')} value={detail.traceId} />
      <SummaryFact label={t('exploreInvestigation.trace.duration')} value={formatTraceDuration(duration)} />
      <SummaryFact label={t('exploreInvestigation.trace.spanCount')} value={String(spanCount)} />
      <SummaryFact label={t('exploreInvestigation.trace.errorCount')} value={String(detail.errorSpanCount)} />
    </dl>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className={viewStyles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SelectedSpanDetail({ span }: { span: NonNullable<GanttPanel['outcome']['data']['spans']>[number] }) {
  const { t } = useTranslation();
  return (
    <div className={traceStyles.selectedSpan}>
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'span', label: t('explore.spanId'), children: span.spanId ?? '—' },
          { key: 'kind', label: t('exploreTrace.kind'), children: span.spanKind ?? '—' },
          { key: 'status', label: t('exploreTrace.status'), children: span.status ?? '—' },
          { key: 'scope', label: t('exploreTrace.scope'), children: span.scopeName ?? '—' }
        ]}
      />
      <OtlpAttributeSection title={t('exploreTrace.spanAttributes')} value={span.spanAttributes ?? undefined} />
      <OtlpAttributeSection title={t('exploreTrace.resourceAttributes')} value={span.resourceAttributes ?? undefined} />
    </div>
  );
}
