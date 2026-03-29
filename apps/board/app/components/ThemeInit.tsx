'use client';

import { useEffect } from 'react';
import { initTheme } from '../lib/theme';

/** Runs initTheme on mount to wire up accent CSS vars and system-theme listener. */
export function ThemeInit() {
  useEffect(() => {
    initTheme();
  }, []);
  return null;
}
