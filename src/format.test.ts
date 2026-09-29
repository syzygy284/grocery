import { describe, expect, it } from 'vitest'
import { daysAgo, fmtNum, fmtQty, parseEntry } from './format'

describe('parseEntry', () => {
  it.each([
    ['6 lb chicken breast', { qty: 6, unit: 'lb', name: 'chicken breast' }],
    ['3 lbs ground beef 93%', { qty: 3, unit: 'lb', name: 'ground beef 93%' }],
    ['2 bags spinach', { qty: 2, unit: 'bag', name: 'spinach' }],
    ['12 bananas', { qty: 12, unit: '', name: 'bananas' }],
    ['6 chicken breast', { qty: 6, unit: '', name: 'chicken breast' }],
    ['1.5 lb salmon', { qty: 1.5, unit: 'lb', name: 'salmon' }],
    ['2 dozen eggs', { qty: 2, unit: 'dozen', name: 'eggs' }],
    ['1 loaf bread', { qty: 1, unit: 'loaf', name: 'bread' }],
    ['2 ctns eggs', { qty: 2, unit: 'ctn', name: 'eggs' }],
    ['2 Bags spinach', { qty: 2, unit: 'bag', name: 'spinach' }],
    ['6lb chicken', { qty: 6, unit: 'lb', name: 'chicken' }],
  ])('%s', (text, expected) => {
    expect(parseEntry(text)).toEqual(expected)
  })

  it('keeps a percentage as part of the name', () => {
    expect(parseEntry('2% milk')).toEqual({ name: '2% milk' })
  })

  it('returns only a name when there is no leading number', () => {
    expect(parseEntry('Greek yogurt')).toEqual({ name: 'Greek yogurt' })
  })

  it('trims and collapses whitespace', () => {
    expect(parseEntry('  2   bags   baby  spinach ')).toEqual({ qty: 2, unit: 'bag', name: 'baby spinach' })
    expect(parseEntry('   ')).toEqual({ name: '' })
  })

  it('keeps the original casing of a non-unit word in the name', () => {
    expect(parseEntry('6 Chicken breast')).toEqual({ qty: 6, unit: '', name: 'Chicken breast' })
  })
})

describe('fmtQty', () => {
  it('shows a bare number when there is no unit', () => {
    expect(fmtQty(12, '')).toBe('12')
  })

  it('pluralizes known units when qty is not 1', () => {
    expect(fmtQty(1, 'bag')).toBe('1 bag')
    expect(fmtQty(2, 'bag')).toBe('2 bags')
    expect(fmtQty(3, 'box')).toBe('3 boxes')
    expect(fmtQty(2, 'loaf')).toBe('2 loaves')
    expect(fmtQty(0.5, 'bag')).toBe('0.5 bags')
  })

  it('leaves units without a plural form alone', () => {
    expect(fmtQty(2, 'lb')).toBe('2 lb')
    expect(fmtQty(1.5, 'oz')).toBe('1.5 oz')
    expect(fmtQty(2, 'dozen')).toBe('2 dozen')
  })

  it('rounds the number', () => {
    expect(fmtQty(0.1 + 0.2, 'lb')).toBe('0.3 lb')
  })
})

describe('fmtNum', () => {
  it('rounds to at most 2 decimals and drops trailing zeros', () => {
    expect(fmtNum(2)).toBe('2')
    expect(fmtNum(2.5)).toBe('2.5')
    expect(fmtNum(2.1)).toBe('2.1')
    expect(fmtNum(1.239)).toBe('1.24')
    expect(fmtNum(0.1 + 0.2)).toBe('0.3')
    expect(fmtNum(0.7 * 3)).toBe('2.1')
  })
})

describe('daysAgo', () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

  it('runs in the pinned timezone', () => {
    // Guard: the DST tests below only mean something if TZ took effect.
    expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(240)
  })

  it('uses calendar days, not 24h periods', () => {
    const now = at(2026, 6, 10, 8)
    expect(daysAgo(at(2026, 6, 10, 1), now)).toBe('today')
    expect(daysAgo(at(2026, 6, 9, 23), now)).toBe('yesterday')
    expect(daysAgo(at(2026, 6, 7, 9), now)).toBe('3 days ago')
  })

  it('treats future timestamps as today', () => {
    expect(daysAgo(at(2026, 6, 11), at(2026, 6, 10))).toBe('today')
  })

  it('counts days across the fall-back DST change', () => {
    // 2026-11-01 has 25 hours in America/New_York.
    expect(daysAgo(at(2026, 11, 1), at(2026, 11, 2))).toBe('yesterday')
  })

  // Regression: Math.floor over a 23-hour spring-forward day used to give 0.
  it('counts days across the spring-forward DST change', () => {
    // 2026-03-08 has 23 hours in America/New_York.
    expect(daysAgo(at(2026, 3, 8), at(2026, 3, 9))).toBe('yesterday')
  })
})
