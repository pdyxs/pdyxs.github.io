import { describe, it, expect } from 'vitest';
import { normaliseAuthoredTag, normaliseAuthoredTags } from './five-w';

describe('normaliseAuthoredTag', () => {
    it('converts the authored slash form to the canonical colon form', () => {
        expect(normaliseAuthoredTag('where/work/seethrough')).toBe('where:work/seethrough');
        expect(normaliseAuthoredTag('what/games/digital/particulars')).toBe(
            'what:games/digital/particulars'
        );
    });

    it('converts a single-segment value', () => {
        expect(normaliseAuthoredTag('when/released')).toBe('when:released');
        expect(normaliseAuthoredTag('what/software')).toBe('what:software');
    });

    it('leaves dimensionless tags alone', () => {
        expect(normaliseAuthoredTag('interactive')).toBe('interactive');
        expect(normaliseAuthoredTag('game-jam')).toBe('game-jam');
        expect(normaliseAuthoredTag('4')).toBe('4');
    });

    it('leaves a bare tag that collides with a dimension name alone', () => {
        // "why" is an authored dimensionless tag on real content.
        expect(normaliseAuthoredTag('why')).toBe('why');
        expect(normaliseAuthoredTag('when')).toBe('when');
    });

    it('is idempotent — an already-canonical value passes through', () => {
        expect(normaliseAuthoredTag('where:work/seethrough')).toBe('where:work/seethrough');
        expect(normaliseAuthoredTag(normaliseAuthoredTag('when/released'))).toBe('when:released');
    });

    it('leaves a slashed value whose first segment is not a dimension', () => {
        expect(normaliseAuthoredTag('games/digital')).toBe('games/digital');
        expect(normaliseAuthoredTag('travel/peru')).toBe('travel/peru');
    });

    it('leaves a dimension with nothing after the slash', () => {
        expect(normaliseAuthoredTag('where/')).toBe('where/');
    });

    it('maps over a list', () => {
        expect(normaliseAuthoredTags(['when/released', 'interactive', 'what:software'])).toEqual([
            'when:released',
            'interactive',
            'what:software',
        ]);
    });
});
