/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

const JAVA_LONG_MAX = '9223372036854775807';

export function normalizeOpaqueId(value: string | undefined) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('Investigation identity is invalid');
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || hasControlCharacter(normalized)) {
    throw new Error('Investigation identity is invalid');
  }
  return normalized;
}

export function normalizePositiveId(value: string | undefined) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('Investigation identity is invalid');
  const normalized = value.trim();
  if (!isPositiveJavaLong(normalized)) throw new Error('Investigation identity is invalid');
  return normalized;
}

export function isPositiveJavaLong(value: string) {
  return (
    /^[1-9]\d{0,18}$/u.test(value) &&
    (value.length < JAVA_LONG_MAX.length || (value.length === JAVA_LONG_MAX.length && value <= JAVA_LONG_MAX))
  );
}

export function requireRecord(
  value: unknown,
  allowedKeys: readonly string[]
): asserts value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Investigation evidence must be a record');
  }
  if (Object.keys(value).some(key => !allowedKeys.includes(key))) {
    throw new Error('Investigation evidence contains unsupported fields');
  }
}

function hasControlCharacter(value: string) {
  return [...value].some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
