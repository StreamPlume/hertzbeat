/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import appStyles from '@/app/styles.css?raw';
import shellStyles from '@/layout/shell/hertzbeat-shell.module.css?raw';

import signalStyles from './monitor-signal-view.module.css?raw';

describe('Monitor Signal View responsive contract', () => {
  it('contains the signal workspace inside the visible shell content at narrow viewports', () => {
    expect(appStyles).toMatch(/body\s*\{[^}]*min-width:\s*1024px/s);
    expect(shellStyles).toMatch(/--hb-shell-sidebar-width:\s*220px/);
    expect(shellStyles).toMatch(/\.content\s*\{[^}]*padding:\s*22px 28px 40px/s);
    expect(signalStyles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.workspace\s*\{[^}]*inline-size:\s*calc\(100vw - var\(--hb-shell-sidebar-width,\s*220px\) - 56px\)[^}]*max-inline-size:\s*100%/s
    );
  });
});
