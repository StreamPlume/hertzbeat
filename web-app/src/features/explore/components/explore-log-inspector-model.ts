/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import type { JsonValue, LogRow } from '../model/explore-signal-contract';

type InspectorField = { key: string; value: string };

export function logInspectorFields(row: LogRow): InspectorField[] {
  const direct: Array<[string, JsonValue | undefined]> = [
    ['logRecordUid', row.logRecordUid ?? undefined],
    ['timeUnixNano', row.timeUnixNano ?? undefined],
    ['observedTimeUnixNano', row.observedTimeUnixNano ?? undefined],
    ['severityNumber', row.severityNumber ?? undefined],
    ['severityText', row.severityText ?? undefined],
    ['message', row.body],
    ['droppedAttributesCount', row.droppedAttributesCount ?? undefined],
    ['traceId', row.traceId ?? undefined],
    ['spanId', row.spanId ?? undefined],
    ['traceFlags', row.traceFlags ?? undefined],
    ['resourceSchemaUrl', row.resourceSchemaUrl ?? undefined],
    ['scopeSchemaUrl', row.scopeSchemaUrl ?? undefined]
  ];
  const fields = direct.flatMap(([key, value]) => (value === undefined ? [] : [{ key, value: fieldValue(value) }]));
  flattenFields('resource', row.resource, fields);
  flattenFields('attributes', row.attributes, fields);
  flattenFields('instrumentationScope', row.instrumentationScope, fields);
  return fields;
}

function flattenFields(prefix: string, value: JsonValue | Record<string, unknown> | null, target: InspectorField[]) {
  if (!value) return;
  for (const [key, nested] of Object.entries(value)) {
    if (nested == null) continue;
    const fieldKey = `${prefix}.${key}`;
    if (isPlainObject(nested)) flattenFields(fieldKey, nested, target);
    else target.push({ key: fieldKey, value: fieldValue(nested as JsonValue) });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldValue(value: JsonValue) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
