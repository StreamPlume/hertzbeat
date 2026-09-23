/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { z } from 'zod';

import { nullableText, safeInteger } from './alert-investigation-schema-primitives';

type AlertIdentityInput = {
  serviceName: string | null;
  serviceNamespace: string | null;
  deploymentEnvironment: string | null;
  entityId: number | null;
  entityType: string | null;
  monitorId: number | null;
  metricName: string | null;
  metricQuery: string | null;
};

const alertIdentitySchema = z
  .object({
    serviceName: nullableText(256),
    serviceNamespace: nullableText(256),
    deploymentEnvironment: nullableText(128),
    entityId: safeInteger.positive().nullable(),
    entityType: nullableText(64),
    monitorId: safeInteger.positive().nullable(),
    metricName: nullableText(256),
    metricQuery: nullableText(4_096)
  })
  .strict()
  .refine(hasAuthoritativeIdentity);

export const identityBlockSchema = z.discriminatedUnion('state', [
  z
    .object({
      state: z.literal('ready'),
      reason: z.literal('observed'),
      source: z.literal('persisted_alert'),
      identity: alertIdentitySchema
    })
    .strict(),
  z
    .object({
      state: z.literal('unavailable'),
      reason: z.enum(['identity_unavailable', 'malformed_data']),
      source: z.literal('persisted_alert'),
      identity: z.null()
    })
    .strict()
]);

function hasAuthoritativeIdentity(value: AlertIdentityInput) {
  return Boolean(value.serviceName || value.entityId || value.monitorId || value.metricName || value.metricQuery);
}
