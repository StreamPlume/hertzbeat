/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOG_DISPLAY_PREFERENCES,
  readLogDisplayPreferences,
  writeLogDisplayPreferences
} from './explore-log-display-preferences';

describe('Explore log display preferences', () => {
  beforeEach(() => localStorage.clear());

  it('uses stable defaults and persists a valid preference set', () => {
    expect(readLogDisplayPreferences()).toEqual(DEFAULT_LOG_DISPLAY_PREFERENCES);

    writeLogDisplayPreferences({ density: 'compact', wrap: false, showTime: false });

    expect(readLogDisplayPreferences()).toEqual({ density: 'compact', wrap: false, showTime: false });
  });

  it('does not allow malformed local storage to change the display contract', () => {
    localStorage.setItem('hertzbeat.explore.logs.display', '{"density":"tiny","wrap":"yes"}');

    expect(readLogDisplayPreferences()).toEqual(DEFAULT_LOG_DISPLAY_PREFERENCES);
  });
});
