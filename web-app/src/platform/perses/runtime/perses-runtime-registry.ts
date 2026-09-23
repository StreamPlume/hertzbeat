/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

const persesRuntimeRegistry = {
  'time-series': () => import('./perses-time-series-runtime'),
  'multi-signal': () => import('./perses-signal-runtime')
} as const;

type PersesRuntimeKind = keyof typeof persesRuntimeRegistry;

export function loadPersesRuntime(kind: 'time-series'): ReturnType<(typeof persesRuntimeRegistry)['time-series']>;
export function loadPersesRuntime(kind: 'multi-signal'): ReturnType<(typeof persesRuntimeRegistry)['multi-signal']>;
export function loadPersesRuntime(kind: PersesRuntimeKind) {
  return persesRuntimeRegistry[kind]();
}
