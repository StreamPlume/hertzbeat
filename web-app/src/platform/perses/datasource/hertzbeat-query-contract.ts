/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { z } from 'zod';

const boundedText = z.string().trim().min(1).max(512);
const identifier = z.string().trim().min(1).max(256);
const traceIdentifier = z.string().regex(/^[0-9a-f]{32}$/u);
const spanIdentifier = z.string().regex(/^[0-9a-f]{16}$/u);
const JAVA_LONG_MAX = '9223372036854775807';
const entityId = z
  .string()
  .regex(/^[1-9]\d{0,18}$/u)
  .refine(value => value.length < JAVA_LONG_MAX.length || value <= JAVA_LONG_MAX);

const contextSchema = z
  .object({
    entityId: entityId.optional(),
    entityType: z
      .string()
      .regex(/^[A-Za-z0-9_.:-]{1,128}$/u)
      .optional(),
    serviceName: identifier.optional(),
    serviceNamespace: identifier.optional(),
    environment: identifier.optional(),
    collectorId: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
      .optional(),
    instance: identifier.optional(),
    endpoint: boundedText.optional()
  })
  .strict();

const timeWindowSchema = z
  .object({
    from: z.number().int().safe().positive(),
    to: z.number().int().safe().positive()
  })
  .strict()
  .refine(window => window.from < window.to, 'Query time window must be ordered')
  .refine(window => window.to - window.from <= 24 * 60 * 60 * 1_000, 'Query time window is too large');

export const HERTZBEAT_QUERY_LIMITS = {
  metricSeries: 32,
  metricPointsPerSeries: 1_200,
  tableRows: 1_000,
  maximumWindowMs: 24 * 60 * 60 * 1_000
} as const;

const baseQueryShape = {
  timeWindow: timeWindowSchema,
  context: contextSchema.optional()
};

const metricQuerySchema = z
  .object({
    signal: z.literal('metrics'),
    queryKind: z.literal('time-series'),
    ...baseQueryShape,
    metric: z
      .object({
        name: z.string().regex(/^[A-Za-z_:][A-Za-z0-9_:]{0,254}$/u),
        aggregation: z.enum(['avg', 'sum', 'min', 'max', 'count']).optional(),
        temporalAggregation: z.enum(['raw', 'rate', 'increase', 'delta']).optional(),
        stepSeconds: z.number().int().positive().max(86_400).optional(),
        operationName: boundedText.optional()
      })
      .strict(),
    limit: z.number().int().positive().max(HERTZBEAT_QUERY_LIMITS.metricSeries).optional()
  })
  .strict();

const logTableQuerySchema = z
  .object({
    signal: z.literal('logs'),
    queryKind: z.literal('table'),
    ...baseQueryShape,
    search: boundedText.optional(),
    severity: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional(),
    traceId: identifier.optional(),
    spanId: identifier.optional(),
    hideInternal: z.boolean().optional(),
    hideNoise: z.boolean().optional(),
    limit: z.number().int().positive().max(HERTZBEAT_QUERY_LIMITS.tableRows).optional()
  })
  .strict();

const traceTableQuerySchema = z
  .object({
    signal: z.literal('traces'),
    queryKind: z.literal('table'),
    ...baseQueryShape,
    operationName: boundedText.optional(),
    errorOnly: z.boolean().optional(),
    minDurationMs: z.number().int().nonnegative().safe().optional(),
    maxDurationMs: z.number().int().nonnegative().safe().optional(),
    spanScope: z.enum(['root', 'entrypoint']).optional(),
    hideInternal: z.boolean().optional(),
    limit: z.number().int().positive().max(HERTZBEAT_QUERY_LIMITS.tableRows).optional()
  })
  .strict()
  .refine(
    query => query.minDurationMs == null || query.maxDurationMs == null || query.minDurationMs <= query.maxDurationMs
  );

const traceGanttQuerySchema = z
  .object({
    signal: z.literal('traces'),
    queryKind: z.literal('gantt'),
    ...baseQueryShape,
    traceId: traceIdentifier,
    spanId: spanIdentifier.optional()
  })
  .strict();

export const hertzBeatQuerySchema = z.union([
  metricQuerySchema,
  logTableQuerySchema,
  traceTableQuerySchema,
  traceGanttQuerySchema
]);

export type HertzBeatQuery = z.infer<typeof hertzBeatQuerySchema>;
export type HertzBeatMetricQuery = z.infer<typeof metricQuerySchema>;
export type HertzBeatLogTableQuery = z.infer<typeof logTableQuerySchema>;
export type HertzBeatTraceTableQuery = z.infer<typeof traceTableQuerySchema>;
export type HertzBeatTraceGanttQuery = z.infer<typeof traceGanttQuerySchema>;

type HertzBeatQueryFailureKind = 'invalid_request' | 'permission' | 'overloaded' | 'unavailable' | 'contract_error';

export type HertzBeatQueryFailure = {
  kind: HertzBeatQueryFailureKind;
  messageKey:
    | 'perses.query.invalid'
    | 'perses.query.permission'
    | 'perses.query.overloaded'
    | 'perses.query.unavailable'
    | 'perses.query.contract';
  retryable: boolean;
};

export type HertzBeatQueryOutcome<T> =
  | { state: 'ready'; data: T; truncated: boolean | 'unknown' }
  | { state: 'empty'; truncated: false }
  | { state: 'error'; error: HertzBeatQueryFailure };
