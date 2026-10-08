import { describe, expect, it } from 'vitest';
import {
  clampWindowStart,
  computeColumnCount,
  initialWindowStart,
  navigateWindow,
  windowContaining,
} from './columns-layout';

describe('computeColumnCount', () => {
  it('clamps to the minimum of 2 below 760px', () => {
    expect(computeColumnCount(0)).toBe(2);
    expect(computeColumnCount(400)).toBe(2);
    expect(computeColumnCount(759)).toBe(2);
  });

  it('matches the issue examples: 1440px -> 3, 3440px -> 7', () => {
    expect(computeColumnCount(1440)).toBe(3);
    expect(computeColumnCount(3440)).toBe(7);
  });

  it('clamps to the maximum of 7 above that', () => {
    expect(computeColumnCount(5000)).toBe(7);
  });

  it('floors to the nearest 380px step', () => {
    expect(computeColumnCount(1139)).toBe(2); // floor(1139/380) = 2
    expect(computeColumnCount(1140)).toBe(3); // floor(1140/380) = 3
  });
});

describe('clampWindowStart', () => {
  it('keeps start within [0, totalDays - windowSize]', () => {
    expect(clampWindowStart(-5, 3, 10)).toBe(0);
    expect(clampWindowStart(100, 3, 10)).toBe(7);
    expect(clampWindowStart(4, 3, 10)).toBe(4);
  });

  it('never lets the window exceed a short trip', () => {
    expect(clampWindowStart(5, 5, 3)).toBe(0);
  });

  it('is 0 for an empty trip', () => {
    expect(clampWindowStart(2, 3, 0)).toBe(0);
  });
});

describe('navigateWindow', () => {
  it('moves by delta, clamped at the edges', () => {
    expect(navigateWindow(2, 1, 3, 10)).toBe(3);
    expect(navigateWindow(0, -1, 3, 10)).toBe(0);
    expect(navigateWindow(6, 1, 3, 10)).toBe(7); // max start = 10-3
  });

  it('supports a shift-sized jump (delta = windowSize)', () => {
    expect(navigateWindow(0, 3, 3, 10)).toBe(3);
    expect(navigateWindow(3, 3, 3, 10)).toBe(6);
    expect(navigateWindow(6, 3, 3, 10)).toBe(7); // clamped
  });
});

describe('windowContaining', () => {
  it('leaves the window unchanged when the index is already visible', () => {
    expect(windowContaining(3, 2, 3, 10)).toBe(2);
  });

  it('moves the window up to make a later index visible, minimally', () => {
    expect(windowContaining(7, 2, 3, 10)).toBe(5);
  });

  it('moves the window down to make an earlier index visible, minimally', () => {
    expect(windowContaining(1, 5, 3, 10)).toBe(1);
  });

  it('clamps the result to the trip bounds', () => {
    expect(windowContaining(9, 5, 3, 10)).toBe(7);
  });
});

describe('initialWindowStart', () => {
  it('starts at Day 1 when today is outside the trip', () => {
    expect(initialWindowStart(undefined, 3, 10)).toBe(0);
  });

  it('starts at today when the trip is running', () => {
    expect(initialWindowStart(4, 3, 10)).toBe(4);
  });

  it('clamps today near the end of the trip', () => {
    expect(initialWindowStart(9, 3, 10)).toBe(7);
  });
});
