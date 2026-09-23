/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { useCallback, useState } from 'react';

export type ExploreLogDisplayPreferences = {
  density: 'compact' | 'comfortable';
  wrap: boolean;
  showTime: boolean;
};

export const DEFAULT_LOG_DISPLAY_PREFERENCES: ExploreLogDisplayPreferences = {
  density: 'comfortable',
  wrap: true,
  showTime: true
};

const STORAGE_KEY = 'hertzbeat.explore.logs.display';

export function readLogDisplayPreferences(): ExploreLogDisplayPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_LOG_DISPLAY_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<ExploreLogDisplayPreferences>;
    if (
      (parsed.density === 'compact' || parsed.density === 'comfortable') &&
      typeof parsed.wrap === 'boolean' &&
      typeof parsed.showTime === 'boolean'
    ) {
      return { density: parsed.density, wrap: parsed.wrap, showTime: parsed.showTime };
    }
  } catch {
    // Storage is an optional display enhancement; keep a stable default when it is unavailable.
  }
  return DEFAULT_LOG_DISPLAY_PREFERENCES;
}

export function writeLogDisplayPreferences(preferences: ExploreLogDisplayPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The current view still owns the preference when persistence is unavailable.
  }
}

export function useLogDisplayPreferences() {
  const [preferences, setPreferences] = useState(readLogDisplayPreferences);
  const updatePreferences = useCallback((next: ExploreLogDisplayPreferences) => {
    setPreferences(next);
    writeLogDisplayPreferences(next);
  }, []);
  return [preferences, updatePreferences] as const;
}
