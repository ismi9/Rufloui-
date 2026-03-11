import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from './formatTime';

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "just now" for a timestamp less than 60 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 30 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('just now');
  });

  it('returns "2 minutes ago" for 120 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 120 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('2 minutes ago');
  });

  it('returns "1 hour ago" for 3600 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 3600 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('1 hour ago');
  });

  it('returns "3 days ago" for 3*86400 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 3 * 86400 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('3 days ago');
  });

  it('returns "just now" for invalid input', () => {
    expect(formatRelativeTime('')).toBe('just now');
    expect(formatRelativeTime('not-a-date')).toBe('just now');
  });

  it('returns singular "1 minute ago"', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 60 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('1 minute ago');
  });

  it('returns "just now" for a timestamp 0 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now).toISOString();
    expect(formatRelativeTime(stamp)).toBe('just now');
  });

  it('returns "1 day ago" for exactly 86400 seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 86400 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('1 day ago');
  });

  it('returns "1 month ago" for 45 days ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 45 * 86400 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('1 month ago');
  });

  it('returns "1 year ago" for 400 days ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now - 400 * 86400 * 1000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('1 year ago');
  });

  it('returns "just now" for future timestamps', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = new Date(now + 60000).toISOString();
    expect(formatRelativeTime(stamp)).toBe('just now');
  });
});
