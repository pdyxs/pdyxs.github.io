import { describe, it, expect } from 'vitest';
import { computeStatusBadge } from './status-badge';

describe('computeStatusBadge', () => {
  it('returns null for published status', () => {
    expect(computeStatusBadge('published', undefined)).toBeNull();
  });

  it('returns null for an absent status (implicit published default)', () => {
    expect(computeStatusBadge(undefined, undefined)).toBeNull();
  });

  it('returns a Draft badge for draft status, with no dateLabel', () => {
    const badge = computeStatusBadge('draft', new Date('2026-01-01'));
    expect(badge).toEqual({ status: 'draft', label: 'Draft' });
  });

  it('returns an Unlisted badge for unlisted status', () => {
    expect(computeStatusBadge('unlisted', undefined)).toEqual({ status: 'unlisted', label: 'Unlisted' });
  });

  it('returns an Archived badge for archived status', () => {
    expect(computeStatusBadge('archived', undefined)).toEqual({ status: 'archived', label: 'Archived' });
  });

  it('returns a Scheduled badge with a formatted dateLabel when a date is present', () => {
    const badge = computeStatusBadge('scheduled', new Date('2027-03-15'));
    expect(badge?.status).toBe('scheduled');
    expect(badge?.label).toBe('Scheduled');
    expect(badge?.dateLabel).toBe('15 Mar 2027');
  });

  it('returns a Scheduled badge with no dateLabel when no date is present', () => {
    const badge = computeStatusBadge('scheduled', undefined);
    expect(badge).toEqual({ status: 'scheduled', label: 'Scheduled' });
  });
});
