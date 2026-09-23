/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';

import { getHertzBeatVisualTokens } from '@/shared/theme/hertzbeat-theme';

import { createHertzBeatPersesTheme } from './hertzbeat-perses-theme';

describe('HertzBeat Perses theme', () => {
  it.each(['default', 'dark', 'compact'] as const)(
    'maps the %s HertzBeat visual tokens into the Perses MUI runtime',
    runtimeTheme => {
      const tokens = getHertzBeatVisualTokens(runtimeTheme);
      const theme = createHertzBeatPersesTheme(runtimeTheme);

      expect(theme.palette.mode).toBe(tokens.mode);
      expect(theme.palette).toMatchObject({
        primary: { main: tokens.color.brandAccent },
        background: { default: tokens.color.canvas, paper: tokens.color.raised },
        divider: tokens.color.border,
        text: { primary: tokens.color.text, secondary: tokens.color.textSecondary },
        action: { hover: tokens.color.hover, selected: tokens.color.selected }
      });
      expect(theme.typography).toMatchObject({
        fontFamily: tokens.font.sans,
        fontSize: tokens.font.baseSize,
        h4: { fontSize: '14px', fontWeight: 600 },
        body2: { fontSize: '12px' },
        button: { fontSize: '13px', fontWeight: 600, textTransform: 'none' }
      });
      expect(theme.shape.borderRadius).toBe(tokens.radius.control);
      expect(theme.spacing(1)).toBe('4px');
    }
  );

  it('owns dense controls, table rhythm, focus, and flat embedded panel surfaces through MUI overrides', () => {
    const components = createHertzBeatPersesTheme('dark').components;

    expect(components?.MuiButton).toMatchObject({
      defaultProps: { disableElevation: true, size: 'small' },
      styleOverrides: { root: { minHeight: 32, borderRadius: 5, boxShadow: 'none' } }
    });
    expect(components?.MuiIconButton).toMatchObject({
      defaultProps: { size: 'small' },
      styleOverrides: { root: { width: 32, height: 32, borderRadius: 5 } }
    });
    expect(components?.MuiOutlinedInput).toMatchObject({
      defaultProps: { size: 'small' },
      styleOverrides: { root: { minHeight: 32, borderRadius: 5 } }
    });
    expect(components?.MuiTableCell).toMatchObject({
      styleOverrides: {
        root: { borderColor: '#282d38', fontSize: '12px' },
        head: { height: 36, backgroundColor: '#101218', fontWeight: 600 }
      }
    });
    expect(components?.MuiCard).toMatchObject({
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: 0, borderRadius: 0, backgroundColor: 'transparent', backgroundImage: 'none', boxShadow: 'none' }
      }
    });
    expect(components?.MuiCardContent).toMatchObject({ styleOverrides: { root: { padding: 0 } } });
    expect(components?.MuiButtonBase?.styleOverrides?.root).toEqual(
      expect.objectContaining({ '&.Mui-focusVisible': expect.objectContaining({ outline: '2px solid #bd7bd0' }) })
    );
  });
});
