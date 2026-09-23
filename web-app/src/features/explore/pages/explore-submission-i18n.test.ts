/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';

import en from '@/assets/i18n/en-us.json';
import ja from '@/assets/i18n/ja-jp.json';
import pt from '@/assets/i18n/pt-br.json';
import zhCn from '@/assets/i18n/zh-cn.json';
import zhTw from '@/assets/i18n/zh-tw.json';
import exploreEn from '@/assets/i18n/explore/en-us.json';
import exploreJa from '@/assets/i18n/explore/ja-jp.json';
import explorePt from '@/assets/i18n/explore/pt-br.json';
import exploreZhCn from '@/assets/i18n/explore/zh-cn.json';
import exploreZhTw from '@/assets/i18n/explore/zh-tw.json';

const submissionErrorKeys = ['unsupportedAggregation', 'invalidStep', 'invalidDuration', 'minExceedsMax'] as const;

const runtimeLocales = [en, ja, pt, zhCn, zhTw] as LocaleRoot[];
const exploreLocales = [exploreEn, exploreJa, explorePt, exploreZhCn, exploreZhTw] as ExploreLocale[];

describe('Explore submission locale contract', () => {
  it('keeps every field validation message available in all runtime locales', () => {
    for (const locale of runtimeLocales) {
      for (const key of submissionErrorKeys) {
        expect(locale.explore.submissionErrors[key]).toEqual(expect.any(String));
      }
    }
  });

  it('describes the metric step in the integer-seconds format accepted by submission', () => {
    for (const locale of runtimeLocales) {
      expect(locale.exploreMetric.step).not.toContain('60s');
      expect(locale.exploreMetric.step).toMatch(/60$/);
    }
    expect(en.exploreMetric.step).toBe('Step in seconds, for example 60');
    expect(pt.exploreMetric.step).toBe('Passo em segundos, por exemplo 60');
  });

  it('localizes the visible metric chart failure fallback', () => {
    for (const locale of runtimeLocales) {
      expect(locale.exploreMetric.chartUnavailable).toEqual(expect.any(String));
      expect(locale.exploreMetric.chartUnavailable).not.toBe('');
    }
  });

  it('localizes every visible signal-parity filter and enum option', () => {
    for (const locale of runtimeLocales) {
      expect(Object.values(locale.exploreMetric.temporalAggregationValues)).toHaveLength(4);
      expect(Object.values(locale.exploreTrace.spanScopeValues)).toHaveLength(2);
      for (const label of [
        locale.exploreMetric.temporalAggregation,
        locale.exploreMetric.temporalAggregationContext,
        locale.exploreLog.hideInternal,
        locale.exploreLog.hideNoise,
        locale.exploreTrace.spanScope,
        locale.exploreTrace.spanScopeContext,
        locale.exploreTrace.hideInternal,
        ...Object.values(locale.exploreMetric.temporalAggregationValues),
        ...Object.values(locale.exploreTrace.spanScopeValues)
      ]) {
        expect(label).toEqual(expect.any(String));
        expect(label).not.toBe('');
      }
    }
  });

  it('localizes live retention honesty and historical log evidence regions', () => {
    for (const locale of runtimeLocales) {
      for (const value of [
        locale.exploreLog.pauseDisconnectGap,
        locale.exploreLog.pauseDisconnect,
        locale.exploreLog.resumeNewStream,
        locale.exploreLog.localRetention,
        locale.exploreLog.history,
        locale.exploreLog.overview,
        locale.exploreLog.trend,
        locale.exploreLog.trendEmpty,
        locale.exploreLog.statisticsUnavailable,
        ...Object.values(locale.exploreLog.statistics)
      ]) {
        expect(value).toEqual(expect.any(String));
        expect(value).not.toBe('');
      }
    }
    expect(en.exploreLog.history).toBe('History');
    expect(pt.exploreLog.history).toBe('Histórico');
    expect(ja.exploreLog.history).not.toBe(en.exploreLog.history);
    expect(zhCn.exploreLog.history).not.toBe(zhTw.exploreLog.history);
  });

  it('describes a rendered single trend bucket without claiming the chart is unavailable', () => {
    const unavailableClaims = [
      /no time trend can be drawn/u,
      /\u3067\u304d\u307e\u305b\u3093/u,
      /n[aã]o [eé] poss[ií]vel/u,
      /\u65e0\u6cd5\u7ed8\u5236/u,
      /\u7121\u6cd5\u7e6a\u88fd/u
    ];
    runtimeLocales.forEach((locale, index) => {
      expect(locale.exploreLog.trendInsufficient).toContain('{{count}}');
      expect(locale.exploreLog.trendInsufficient).not.toMatch(unavailableClaims[index]!);
    });
    expect(en.exploreLog.trendInsufficient).toBe('The current window contains one bucket ({{count}} logs).');
    expect(pt.exploreLog.trendInsufficient).toBe('A janela atual contém um intervalo ({{count}} logs).');
  });

  it('localizes every permanent Logs query-builder label and the lossless fallback', () => {
    for (const locale of exploreLocales) {
      expect(locale.explore.serviceNamespace).toEqual(expect.any(String));
      for (const label of Object.values(locale.explore.logQueryBuilder)) {
        expect(label).toEqual(expect.any(String));
        expect(label).not.toBe('');
      }
    }
    expect(exploreEn.explore.logQueryBuilder.losslessError).toBe(
      'This filter cannot be represented without loss in Builder. Keep editing the exact expression in Code.'
    );
  });

  it('localizes every permanent log result-toolbar control', () => {
    const keys = [
      'provenance',
      'returnedStatus',
      'pageStatus',
      'windowStatus',
      'historicalEvidence',
      'resultToolbar',
      'displayPreferences',
      'compactRows',
      'wrapMessages',
      'showTime',
      'previousPage',
      'nextPage'
    ] as const;
    for (const locale of exploreLocales) {
      for (const key of keys) {
        expect(locale.explore.perses[key]).toEqual(expect.any(String));
        expect(locale.explore.perses[key]).not.toBe('');
      }
    }
  });
});

type ExploreLocale = {
  explore: {
    serviceNamespace: string;
    logQueryBuilder: Record<string, string>;
    perses: Record<string, string>;
  };
};

type LocaleRoot = {
  explore: { submissionErrors: Record<(typeof submissionErrorKeys)[number], string> };
  exploreMetric: {
    step: string;
    chartUnavailable: string;
    temporalAggregation: string;
    temporalAggregationContext: string;
    temporalAggregationValues: Record<'raw' | 'rate' | 'increase' | 'delta', string>;
  };
  exploreLog: {
    history: string;
    hideInternal: string;
    hideNoise: string;
    pauseDisconnectGap: string;
    pauseDisconnect: string;
    resumeNewStream: string;
    localRetention: string;
    overview: string;
    trend: string;
    trendEmpty: string;
    trendInsufficient: string;
    statisticsUnavailable: string;
    statistics: Record<'total' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', string>;
  };
  exploreTrace: {
    spanScope: string;
    spanScopeContext: string;
    spanScopeValues: Record<'root' | 'entrypoint', string>;
    hideInternal: string;
  };
};
