/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(projectRoot, 'src');
const persesRoot = join(sourceRoot, 'platform', 'perses');

test('Perses has one public platform boundary with the required runtime ownership', () => {
  assert.ok(existsSync(join(persesRoot, 'index.ts')), 'src/platform/perses/index.ts must own the public API');
  assert.ok(existsSync(join(persesRoot, 'runtime')), 'src/platform/perses/runtime must own React integration');
  assert.ok(existsSync(join(persesRoot, 'plugins')), 'src/platform/perses/plugins must own plugin registration');
  assert.ok(
    existsSync(join(persesRoot, 'datasource')),
    'src/platform/perses/datasource must own HertzBeat API queries'
  );
});

test('production code imports Perses packages only inside the platform boundary', () => {
  const violations = sourceFiles(sourceRoot).flatMap(path => {
    const source = readFileSync(path, 'utf8');
    if (!source.includes('@perses-dev/')) return [];
    const normalized = relative(sourceRoot, path).split(sep).join('/');
    return normalized.startsWith('platform/perses/') ? [] : [normalized];
  });

  assert.deepEqual(violations, []);
});

test('production code never imports the deprecated Perses core package', () => {
  const violations = sourceFiles(sourceRoot).flatMap(path => {
    const source = readFileSync(path, 'utf8');
    return source.includes('@perses-dev/core') ? [relative(sourceRoot, path).split(sep).join('/')] : [];
  });

  assert.deepEqual(violations, []);
});

test('business features import only the public Perses adapter entry', () => {
  const violations = sourceFiles(join(sourceRoot, 'features')).flatMap(path => {
    const source = readFileSync(path, 'utf8');
    return source.includes('@/platform/perses/') ? [relative(sourceRoot, path).split(sep).join('/')] : [];
  });

  assert.deepEqual(violations, []);
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /[.]tsx?$/.test(entry) && !/[.](?:test|spec)[.]tsx?$/.test(entry) ? [path] : [];
  });
}
