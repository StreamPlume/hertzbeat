/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { z } from 'zod';

const JAVA_LONG_MAX = '9223372036854775807';

export const safeInteger = z.number().int().safe();
export const nonNegativeInteger = safeInteger.nonnegative();
export const positiveTimestamp = safeInteger.positive();
export const positiveLongDecimal = z
  .string()
  .regex(/^[1-9]\d{0,18}$/u)
  .refine(value => value.length < JAVA_LONG_MAX.length || value <= JAVA_LONG_MAX);
export const nonNegativeLongDecimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/u)
  .refine(value => value.length < JAVA_LONG_MAX.length || value <= JAVA_LONG_MAX);

export const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum).refine(hasPrintableText);
export const nullableText = (maximum: number) => requiredText(maximum).nullable();
export const boundedMap = (entries: number, valueLength: number) =>
  z
    .record(requiredText(128), z.string().max(valueLength).refine(hasPrintableText))
    .refine(value => Object.keys(value).length <= entries);

function hasPrintableText(value: string) {
  return Array.from(value).every(character => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  });
}
