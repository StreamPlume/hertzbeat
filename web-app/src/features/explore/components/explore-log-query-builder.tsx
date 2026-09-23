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

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Select } from 'antd';
import type { TFunction } from 'i18next';
import { useId, useMemo, useState, type ReactNode } from 'react';

import {
  LOG_FILTER_OPERATORS,
  parseLogFilterExpression,
  serializeLogFilterExpression,
  type LogFilterClause,
  type LogFilterOperator
} from '../model/explore-log-filter-expression';
import type { ExploreSubmissionViewModel, LogExploreSubmissionDraft } from '../model/explore-submission-model';
import styles from './explore-log-query-builder.module.css';

export type LogQueryEditorMode = 'builder' | 'code';

type Props = Pick<ExploreSubmissionViewModel, 'updateField'> & {
  draft: LogExploreSubmissionDraft;
  mode: LogQueryEditorMode;
  t: TFunction;
};

type FilterScope = 'resource' | 'attribute';
type ScopedClause = LogFilterClause & { scope: FilterScope };

const VALUELESS_OPERATORS = new Set<LogFilterOperator>(['EXISTS', 'NOT EXISTS']);

export function ExploreLogQueryBuilder({ draft, mode, t, updateField }: Props) {
  const sourceKey = `${draft.resourceFilter}\u0000${draft.attributeFilter}`;
  const parsedRows = useMemo(
    () => rowsFromDraft(draft.resourceFilter, draft.attributeFilter),
    [draft.attributeFilter, draft.resourceFilter]
  );
  const [localRows, setLocalRows] = useState<{ sourceKey: string; rows: ScopedClause[] }>();
  const rows = localRows?.sourceKey === sourceKey ? localRows.rows : (parsedRows ?? []);

  const hasLosslessError = !parsedRows;

  return (
    <div className={styles.workspace}>
      <LogScopeFields draft={draft} t={t} updateField={updateField} />

      {mode === 'builder' ? (
        <BuilderConditions
          rows={rows}
          t={t}
          add={() => setLocalRows({ sourceKey, rows: [...rows, emptyRow()] })}
          update={updateRow}
          remove={removeRow}
          emptyFooter={<VisibilityFilters compact draft={draft} t={t} updateField={updateField} />}
        />
      ) : (
        <div className={styles.codeGrid}>
          <TextAreaField
            label={t('explore.logQueryBuilder.resourceCode')}
            placeholder={t('explore.logQueryBuilder.resourceCodeExample')}
            value={draft.resourceFilter}
            invalid={hasLosslessError && !parseLogFilterExpression(draft.resourceFilter).valid}
            onChange={value => updateField({ field: 'resourceFilter', value })}
          />
          <TextAreaField
            label={t('explore.logQueryBuilder.attributeCode')}
            placeholder={t('explore.logQueryBuilder.attributeCodeExample')}
            value={draft.attributeFilter}
            invalid={hasLosslessError && !parseLogFilterExpression(draft.attributeFilter).valid}
            onChange={value => updateField({ field: 'attributeFilter', value })}
          />
          {hasLosslessError && <p role="alert">{t('explore.logQueryBuilder.losslessError')}</p>}
        </div>
      )}

      {(mode === 'code' || rows.length > 0) && <VisibilityFilters draft={draft} t={t} updateField={updateField} />}
    </div>
  );

  function updateRow(index: number, changes: Partial<ScopedClause>) {
    const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row));
    setLocalRows({ sourceKey, rows: nextRows });
    writeRows(nextRows, draft, updateField);
  }

  function removeRow(index: number) {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    setLocalRows({ sourceKey, rows: nextRows });
    writeRows(nextRows, draft, updateField);
  }
}

function BuilderConditions({
  rows,
  t,
  add,
  update,
  remove,
  emptyFooter
}: {
  rows: ScopedClause[];
  t: TFunction;
  add: () => void;
  update: (index: number, changes: Partial<ScopedClause>) => void;
  remove: (index: number) => void;
  emptyFooter: ReactNode;
}) {
  const addButton = (
    <Button type="text" icon={<PlusOutlined aria-hidden />} onClick={add}>
      {t('explore.logQueryBuilder.addCondition')}
    </Button>
  );
  if (!rows.length) {
    return (
      <div className={styles.emptyConditions} role="group" aria-label={t('explore.logQueryBuilder.conditions')}>
        <span className={styles.emptyConditionsTitle}>{t('explore.logQueryBuilder.conditions')}</span>
        {addButton}
        {emptyFooter}
      </div>
    );
  }
  return (
    <fieldset className={styles.conditions} aria-label={t('explore.logQueryBuilder.conditions')}>
      <legend>{t('explore.logQueryBuilder.conditions')}</legend>
      <div className={styles.conditionHeader} aria-hidden>
        <span>{t('explore.logQueryBuilder.scope')}</span>
        <span>{t('explore.logQueryBuilder.field')}</span>
        <span>{t('explore.logQueryBuilder.operator')}</span>
        <span>{t('explore.logQueryBuilder.value')}</span>
        <span>{t('explore.logQueryBuilder.actions')}</span>
      </div>
      {rows.map((row, index) => (
        <ConditionRow
          key={`${row.scope}-${index}`}
          index={index}
          row={row}
          t={t}
          update={changes => update(index, changes)}
          remove={() => remove(index)}
        />
      ))}
      {addButton}
    </fieldset>
  );
}

function VisibilityFilters({
  draft,
  t,
  updateField,
  compact = false
}: Pick<Props, 'draft' | 't' | 'updateField'> & { compact?: boolean }) {
  return (
    <div
      className={[styles.visibility, compact && styles.compactVisibility].filter(Boolean).join(' ')}
      role="group"
      aria-label={t('explore.logQueryBuilder.visibility')}
    >
      <Checkbox
        checked={draft.hideInternal}
        onChange={event => updateField({ field: 'hideInternal', value: event.target.checked })}
      >
        {t('exploreLog.hideInternal')}
      </Checkbox>
      <Checkbox
        checked={draft.hideNoise}
        onChange={event => updateField({ field: 'hideNoise', value: event.target.checked })}
      >
        {t('exploreLog.hideNoise')}
      </Checkbox>
    </div>
  );
}

function LogScopeFields({ draft, t, updateField }: Pick<Props, 'draft' | 't' | 'updateField'>) {
  return (
    <div className={styles.scopeGrid}>
      <TextField
        label={t('explore.serviceName')}
        placeholder={t('explore.logQueryBuilder.serviceNameExample')}
        value={draft.serviceName}
        onChange={value => updateField({ field: 'serviceName', value })}
      />
      <TextField
        label={t('explore.serviceNamespace')}
        placeholder={t('explore.logQueryBuilder.namespaceExample')}
        value={draft.serviceNamespace}
        onChange={value => updateField({ field: 'serviceNamespace', value })}
      />
      <TextField
        label={t('explore.environment')}
        placeholder={t('explore.logQueryBuilder.environmentExample')}
        value={draft.environment}
        onChange={value => updateField({ field: 'environment', value })}
      />
      <SelectField
        label={t('explore.severity')}
        placeholder={t('explore.logQueryBuilder.severityPlaceholder')}
        value={draft.severityText}
        options={['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']}
        onChange={value => updateField({ field: 'severityText', value })}
      />
      <TextField
        label={t('explore.traceId')}
        placeholder={t('explore.logQueryBuilder.traceIdExample')}
        value={draft.traceId}
        onChange={value => updateField({ field: 'traceId', value })}
      />
      <TextField
        label={t('explore.spanId')}
        placeholder={t('explore.logQueryBuilder.spanIdExample')}
        value={draft.spanId}
        onChange={value => updateField({ field: 'spanId', value })}
      />
    </div>
  );
}

function ConditionRow({
  index,
  row,
  t,
  update,
  remove
}: {
  index: number;
  row: ScopedClause;
  t: TFunction;
  update: (changes: Partial<ScopedClause>) => void;
  remove: () => void;
}) {
  const number = index + 1;
  const prefix = t('explore.logQueryBuilder.conditionLabel', { number });
  const valueDisabled = VALUELESS_OPERATORS.has(row.operator);
  return (
    <div className={styles.conditionRow}>
      <ConditionField label={t('explore.logQueryBuilder.scope')}>
        <Select<FilterScope>
          aria-label={`${prefix} ${t('explore.logQueryBuilder.scope').toLocaleLowerCase()}`}
          value={row.scope}
          options={[
            { value: 'resource', label: t('explore.logQueryBuilder.resourceScope') },
            { value: 'attribute', label: t('explore.logQueryBuilder.attributeScope') }
          ]}
          onChange={scope => update({ scope })}
        />
      </ConditionField>
      <ConditionField label={t('explore.logQueryBuilder.field')}>
        <Input
          aria-label={`${prefix} ${t('explore.logQueryBuilder.field').toLocaleLowerCase()}`}
          value={row.field}
          placeholder={t('explore.logQueryBuilder.fieldExample')}
          onChange={event => update({ field: event.target.value })}
        />
      </ConditionField>
      <ConditionField label={t('explore.logQueryBuilder.operator')}>
        <Select<LogFilterOperator>
          aria-label={`${prefix} ${t('explore.logQueryBuilder.operator').toLocaleLowerCase()}`}
          value={row.operator}
          options={LOG_FILTER_OPERATORS.map(operator => ({ value: operator, label: operator }))}
          onChange={operator => update({ operator, value: VALUELESS_OPERATORS.has(operator) ? '' : row.value })}
        />
      </ConditionField>
      <ConditionField label={t('explore.logQueryBuilder.value')}>
        <Input
          aria-label={`${prefix} ${t('explore.logQueryBuilder.value').toLocaleLowerCase()}`}
          value={row.value}
          disabled={valueDisabled}
          placeholder={
            valueDisabled ? t('explore.logQueryBuilder.notRequired') : t('explore.logQueryBuilder.valueExample')
          }
          onChange={event => update({ value: event.target.value })}
        />
      </ConditionField>
      <Button
        type="text"
        aria-label={t('explore.logQueryBuilder.removeCondition', { number })}
        icon={<DeleteOutlined aria-hidden />}
        onClick={remove}
      />
    </div>
  );
}

function ConditionField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.conditionField}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function TextField({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const labelId = useId();
  return (
    <label className={styles.field}>
      <span id={labelId}>{label}</span>
      <Select
        aria-labelledby={labelId}
        allowClear
        value={value || undefined}
        placeholder={placeholder}
        options={options.map(option => ({ value: option, label: option }))}
        onChange={nextValue => onChange(nextValue ?? '')}
      />
    </label>
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  invalid,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Input.TextArea
        aria-label={label}
        aria-invalid={invalid || undefined}
        autoSize={{ minRows: 1, maxRows: 3 }}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

function rowsFromDraft(resourceFilter: string, attributeFilter: string) {
  const resource = parseLogFilterExpression(resourceFilter);
  const attribute = parseLogFilterExpression(attributeFilter);
  if (!resource.valid || !attribute.valid) return undefined;
  return [
    ...resource.clauses.map(clause => ({ ...clause, scope: 'resource' as const })),
    ...attribute.clauses.map(clause => ({ ...clause, scope: 'attribute' as const }))
  ];
}

function emptyRow(): ScopedClause {
  return { scope: 'resource', field: '', operator: '=', value: '' };
}

function writeRows(
  rows: ScopedClause[],
  draft: Pick<LogExploreSubmissionDraft, 'resourceFilter' | 'attributeFilter'>,
  updateField: ExploreSubmissionViewModel['updateField']
) {
  const resourceFilter = serializeScope(rows, 'resource');
  const attributeFilter = serializeScope(rows, 'attribute');
  if (resourceFilter !== undefined) updateField({ field: 'resourceFilter', value: resourceFilter });
  if (attributeFilter !== undefined) updateField({ field: 'attributeFilter', value: attributeFilter });
}

function serializeScope(rows: ScopedClause[], scope: FilterScope) {
  const scopedRows = rows.filter(row => row.scope === scope);
  if (!scopedRows.length) return '';
  if (scopedRows.some(row => !row.field.trim() || (!VALUELESS_OPERATORS.has(row.operator) && !row.value.trim()))) {
    return undefined;
  }
  return (
    serializeLogFilterExpression(
      scopedRows.map(row => ({ field: row.field, operator: row.operator, value: row.value }))
    ) ?? undefined
  );
}
