/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import appStyles from '@/app/styles.css?raw';

import traceStyles from './explore-investigation-trace.module.css?raw';
import viewStyles from './explore-investigation-view.module.css?raw';
import queryStyles from './explore-query-bar.module.css?raw';
import historyStyles from './explore-history-result.module.css?raw';
import logStyles from './log-result.module.css?raw';
import resultFrameStyles from './signal-result-frame.module.css?raw';
import workspaceStyles from './explore-workbench.module.css?raw';
import persesStyles from '@/platform/perses/runtime/hertzbeat-perses-primitives.module.css?raw';
import { createHertzBeatPersesTheme } from '@/platform/perses/runtime/hertzbeat-perses-theme';

describe('Explore investigation responsive contract', () => {
  it('keeps the Gantt readable at ordinary desktop widths and contains narrow runtime overflow', () => {
    expect(traceStyles).not.toMatch(
      /@media \(min-width:\s*1180px\)[\s\S]*\.tracePrimary\s*\{[^}]*grid-template-columns/s
    );
    expect(traceStyles).toMatch(
      /@media \(min-width:\s*1680px\)[\s\S]*\.tracePrimary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(280px,\s*1fr\)/s
    );
    expect(traceStyles).toMatch(/\.spanInspector\s*\{[^}]*border-top:\s*1px solid/s);
    expect(traceStyles).toMatch(
      /@media \(min-width:\s*1680px\)[\s\S]*\.spanInspector\s*\{[^}]*border-left:\s*1px solid/s
    );
    expect(traceStyles).toMatch(/\.ganttRuntime\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*auto/s);
  });

  it('releases the shared desktop body floor only while a narrow focused investigation is mounted', () => {
    expect(appStyles).toMatch(/body\s*\{[^}]*min-width:\s*1024px/s);
    expect(viewStyles).toMatch(
      /@media \(max-width:\s*768px\)[\s\S]*:global\(body:has\(\[data-explore-investigation='true'\]\)\)\s*\{[^}]*min-width:\s*0/s
    );
  });

  it('removes secondary shell summaries only from a narrow focused investigation header', () => {
    expect(viewStyles).toMatch(
      /@media \(max-width:\s*768px\)[\s\S]*body:has\(\[data-explore-investigation='true'\]\)[\s\S]*\[data-testid='shell-time-policy'\][\s\S]*\[data-testid='shell-status-greptime'\][\s\S]*\[data-testid='shell-status-collector'\][\s\S]*\{[^}]*display:\s*none/s
    );
    expect(viewStyles).not.toMatch(/\[data-testid='shell-status-server'\]/);
  });

  it('contains ordinary Explore through tablet width without changing the desktop shell floor', () => {
    expect(workspaceStyles).toMatch(
      /@media \(max-width:\s*768px\)[\s\S]*body:has\(\[data-explore-workspace='true'\]\)[\s\S]*min-width:\s*0/s
    );
    expect(workspaceStyles).toMatch(
      /body:has\(\[data-explore-workspace='true'\]\)[\s\S]*\[data-testid='shell-time-policy'\][\s\S]*\[data-testid='shell-status-greptime'\][\s\S]*\[data-testid='shell-status-collector'\][\s\S]*display:\s*none/s
    );
    expect(workspaceStyles).not.toMatch(/\[data-testid='shell-status-server'\]/);
    expect(queryStyles).toMatch(/@media \(max-width:\s*700px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(queryStyles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.commandFields\s*\{[^}]*flex-direction:\s*column[^}]*\}[\s\S]*\.commandActions\s*\{[^}]*flex-direction:\s*row/s
    );
    expect(queryStyles).not.toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.commandFields,\s*\.commandActions\s*\{[^}]*flex-direction:\s*column/s
    );
    expect(appStyles).toMatch(/body\s*\{[^}]*min-width:\s*1024px/s);
  });

  it('keeps Logs overview, trend, and result on flat full-width workbench surfaces', () => {
    expect(logStyles).toMatch(/\.statistics\s*\{[^}]*flex-direction:\s*column/s);
    expect(logStyles).toMatch(/\.statistics\s*\{[^}]*margin-bottom:\s*0/s);
    expect(logStyles).toMatch(
      /\.statistics\s*>\s*\.overview\s*\{[^}]*min-height:\s*var\(--hb-workbench-header-height\)/s
    );
    expect(logStyles).toMatch(
      /\.trend\[data-trend-density='compact'\]\s*\{[^}]*min-height:\s*var\(--hb-workbench-header-height\)/s
    );
    expect(logStyles).not.toMatch(/\.statistics\s*>\s*section\s*\{[^}]*border-bottom:/s);
    expect(logStyles).not.toMatch(/\.statistics\s*>\s*section\s*\{[^}]*border-radius:/s);
    expect(logStyles).not.toMatch(/\.statistics\s*\{[^}]*grid-template-columns:/s);
    expect(historyStyles).toMatch(/\.logRegion\s*\{[^}]*padding-block:\s*0/s);
    expect(historyStyles).toMatch(/\.logRegion\s*\+\s*\.logRegion\s*\{[^}]*border-top:\s*1px solid/s);
    expect(resultFrameStyles).toMatch(/\.header\s*\{[^}]*min-height:\s*var\(--hb-workbench-header-height\)/s);
    expect(resultFrameStyles).toMatch(
      /\.frame\[data-meta-presentation='compact'\]\s+\.meta\s+dt\s*\{[^}]*font-size:\s*11px/s
    );
    expect(resultFrameStyles).not.toMatch(
      /\.frame\[data-meta-presentation='compact'\]\s+\.meta\s+dt\s*\{[^}]*position:\s*absolute/s
    );
  });

  it('uses one shared workbench rhythm for Logs controls and region headers', () => {
    expect(appStyles).toMatch(/--hb-workbench-control-height:\s*32px/s);
    expect(appStyles).toMatch(/--hb-workbench-header-height:\s*36px/s);
    expect(queryStyles).toMatch(
      /\.form\s+:global\(\[data-hb-operational-command-bar\]\)\s*\{[^}]*min-height:\s*var\(--hb-workbench-header-height\)/s
    );
    expect(queryStyles).toMatch(/\.form\s+:global\(\.ant-btn\)[\s\S]*height:\s*var\(--hb-workbench-control-height\)/s);
  });

  it('flattens embedded Perses panels through its theme and keeps host actions on a flat scrollable disclosure', () => {
    const components = createHertzBeatPersesTheme('dark').components;
    expect(components?.MuiCard).toMatchObject({
      styleOverrides: {
        root: { border: 0, borderRadius: 0, backgroundColor: 'transparent', boxShadow: 'none' }
      }
    });
    expect(components?.MuiCardContent).toMatchObject({ styleOverrides: { root: { padding: 0 } } });
    expect(persesStyles).not.toMatch(/\.Mui(?:Card|Paper|Box)-root/);
    expect(persesStyles).toMatch(/\.interactionList\s+li\s*>\s*div\s*\{[^}]*overflow-x:\s*auto/s);
    expect(persesStyles).toMatch(/\.interactions\s+button\s*\{[^}]*white-space:\s*nowrap/s);
    expect(persesStyles).toMatch(
      /@media \(width <= 700px\)[\s\S]*\.interactionList\s+li\s*>\s*div\s*\{[^}]*flex-basis:\s*auto/s
    );
    expect(persesStyles).toMatch(
      /\.interactions\s*\{[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/s
    );
  });

  it('keeps narrow Logs readable without a fixed table floor or page-level horizontal scrolling', () => {
    expect(historyStyles).toMatch(/\.persesFrame\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
    expect(persesStyles).toMatch(
      /\.runtime:has\(>\s*:global\(\[data-perses-primitive='logs-table'\]\)\)\s*\{[^}]*overflow-x:\s*hidden/s
    );
    expect(persesStyles).not.toMatch(/min-width:\s*640px/);
    expect(persesStyles).toMatch(
      /@media \(width <= 420px\)[\s\S]*grid-template-rows:\s*auto\s+auto[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/s
    );
    expect(persesStyles).toMatch(
      /@media \(width <= 420px\)[\s\S]*data-hertzbeat-log-severity[\s\S]*grid-row:\s*1[\s\S]*grid-column:\s*2/s
    );
    expect(persesStyles).toMatch(/data-hertzbeat-log-severity[\s\S]*max-width:\s*12ch/s);
    expect(persesStyles).toMatch(
      /@media \(width <= 420px\)[\s\S]*div:last-of-type\)\s*\{[^}]*grid-row:\s*2[^}]*grid-column:\s*1\s*\/\s*-1/s
    );
    expect(persesStyles).toMatch(/button:focus-visible\)[\s\S]*opacity:\s*1\s*!important/s);
  });

  it('keeps the narrow Query command groups ordered and raises mobile controls to 36px', () => {
    expect(queryStyles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.logCommandFields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s
    );
    expect(queryStyles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*data-hb-operational-command-bar[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/s
    );
    expect(queryStyles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.form\s+:global\(\.ant-btn\)[\s\S]*min-height:\s*36px/s
    );
    expect(queryStyles).toMatch(
      /@media \(max-width:\s*520px\)[\s\S]*\.logCommandFields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s
    );
    expect(workspaceStyles).toMatch(
      /\.signal:focus-visible,[\s\S]*\.activeSignal:focus-visible\s*\{[^}]*outline:\s*2px solid/s
    );
  });

  it('gives runtime, completeness, and interactions independent grid rows', () => {
    expect(persesStyles).toMatch(/\.primitive\s*\{[^}]*grid-template-rows:\s*360px\s+auto\s+auto/s);
    expect(persesStyles).toMatch(
      /\.primitive\[data-variant='compact'\]\s*\{[^}]*min-height:\s*84px[^}]*grid-template-rows:\s*84px\s+auto\s+auto/s
    );
    expect(persesStyles).toMatch(
      /\.primitive\[data-variant='compact'\]\s+\.runtime,[\s\S]*height:\s*84px[^}]*min-height:\s*84px/s
    );
  });

  it('keeps focused signal facts flat inside their single outer surface', () => {
    expect(viewStyles).toMatch(/\.signalSection\s*\{[^}]*border:\s*1px solid[^}]*border-radius:/s);
    expect(viewStyles).toMatch(/\.fact\s*\{[^}]*border-bottom:\s*1px solid/s);
    expect(viewStyles).not.toMatch(/\.fact\s*\{[^}]*border:\s*1px solid/s);
    expect(viewStyles).not.toMatch(/\.fact\s*\{[^}]*border-radius:/s);
  });

  it('uses tabular figures for ordinary Logs overview and result counts', () => {
    expect(logStyles).toMatch(/\.overviewStats\s+dd\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
    expect(queryStyles).toMatch(/\.commandFields\s*\{[^}]*min-width:\s*0/s);
    expect(resultFrameStyles).toMatch(/\.identity\s+span\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
  });
});
