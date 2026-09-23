/* Licensed to the Apache Software Foundation (ASF) under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';

import en from '@/assets/i18n/en-us.json';
import ja from '@/assets/i18n/ja-jp.json';
import pt from '@/assets/i18n/pt-br.json';
import zhCn from '@/assets/i18n/zh-cn.json';
import zhTw from '@/assets/i18n/zh-tw.json';

describe('Alert investigation locale contract', () => {
  it('publishes the complete investigation workspace in all runtime locales', () => {
    const keys = flatten(en.alertInvestigation);
    for (const locale of [ja, pt, zhCn, zhTw]) {
      expect(flatten(locale.alertInvestigation)).toEqual(keys);
      expect(locale.alert.askAi).toEqual(expect.any(String));
    }
    expect(en.alert.askAi).toEqual(expect.any(String));
    expect(keys).toEqual(expect.arrayContaining(['sections.metrics', 'sections.logs', 'sections.traces']));
  });
});

function flatten(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value)
    .flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return item && typeof item === 'object' && !Array.isArray(item)
        ? flatten(item as Record<string, unknown>, path)
        : [path];
    })
    .sort();
}
