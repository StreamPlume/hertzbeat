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

import { z } from 'zod';

import { ExploreSignalContractError, type ExplorePageResult, type TraceRow } from '../model/explore-signal-contract';
import {
  nullableJavaLongSchema,
  nullableNonNegativeIntegerSchema,
  nullableStringMapSchema,
  nullableStringSchema,
  nonNegativeIntegerSchema,
  parseExplorePage
} from './explore-wire-schema';

const traceSummaryShape = {
  traceId: z.string().min(1),
  rootSpanId: nullableStringSchema,
  serviceName: nullableStringSchema,
  serviceNamespace: nullableStringSchema,
  rootSpanName: nullableStringSchema,
  durationNanos: nullableJavaLongSchema,
  status: nullableStringSchema,
  startTime: nullableNonNegativeIntegerSchema,
  errorSpanCount: nonNegativeIntegerSchema,
  resourceAttributes: nullableStringMapSchema
};
const traceServiceStatSchema = z
  .object({
    spanCount: nonNegativeIntegerSchema.positive(),
    errorCount: nonNegativeIntegerSchema
  })
  .refine(stat => stat.errorCount <= stat.spanCount);
const traceServiceStatsSchema = z
  .record(
    z.string().refine(serviceName => serviceName.trim().length > 0),
    traceServiceStatSchema
  )
  .refine(stats => Object.keys(stats).length > 0);
const traceRowShape = {
  ...traceSummaryShape,
  spanCount: nonNegativeIntegerSchema.positive().nullable(),
  serviceStats: traceServiceStatsSchema.nullable()
};
const traceRowSchema: z.ZodType<TraceRow> = z.object(traceRowShape).superRefine((row, context) => {
  if ((row.spanCount === null) !== (row.serviceStats === null)) {
    context.addIssue({ code: 'custom', message: 'Trace completeness evidence must be jointly available' });
    return;
  }
  if (row.spanCount === null || row.serviceStats === null) return;
  const stats = Object.values(row.serviceStats);
  const spanTotal = stats.reduce((sum, stat) => sum + stat.spanCount, 0);
  const errorTotal = stats.reduce((sum, stat) => sum + stat.errorCount, 0);
  if (
    !Number.isSafeInteger(spanTotal) ||
    !Number.isSafeInteger(errorTotal) ||
    spanTotal !== row.spanCount ||
    errorTotal !== row.errorSpanCount
  ) {
    context.addIssue({ code: 'custom', message: 'Trace service statistics do not match trace totals' });
  }
});

export function parseTracePage(value: unknown, pageIndex: number, pageSize: number): ExplorePageResult<TraceRow> {
  const page = parseExplorePage(value, pageIndex, pageSize, traceRowSchema);
  requireUnique(
    page.content.map(row => row.traceId),
    'trace page contains duplicate traceId'
  );
  return page;
}

function requireUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) throw new ExploreSignalContractError(message);
}
