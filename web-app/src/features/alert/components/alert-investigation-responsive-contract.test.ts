/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import styles from './alert-investigation-view.module.css?raw';

describe('Alert investigation responsive contract', () => {
  it('releases the global shell minimum only for the focused alert route', () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*:global\(body:has\(\[data-alert-investigation='true'\]\)\)\s*\{[^}]*min-width:\s*0/s
    );
  });

  it('contains wide evidence locally and simplifies secondary shell status at 680px', () => {
    expect(styles).toMatch(/\.tableScroll\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
    expect(styles).toMatch(/\.signalBody\s*\{[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/s);
    expect(styles).toMatch(
      /body:has\(\[data-alert-investigation='true'\]\)[\s\S]*shell-time-policy[\s\S]*shell-status-greptime[\s\S]*shell-status-collector[\s\S]*display:\s*none/s
    );
  });
});
