import { describe, expect, it } from 'vitest';
import { scoreCase } from '../src/services/scoring.js';
import { toPublicCase } from '../src/services/serializer.js';
import { sampleCase } from '../src/data/sampleCase.js';

describe('case scoring', () => {
  it('awards the base and time bonus, then applies hint penalties', () => {
    expect(scoreCase(true, 1, 0)).toEqual({ correct: true, score: 1050, breakdown: { base: 1000, hintPenalty: 150, timeBonus: 200 } });
  });
  it('returns zero for an incorrect accusation', () => {
    expect(scoreCase(false, 2, 0).score).toBe(0);
  });
});

describe('public case serialization', () => {
  it('strips solution and hint text before the case is solved', () => {
    const view = toPublicCase({ ...structuredClone(sampleCase), status: 'ready', result: { score: 1000 }, hints: sampleCase.hints });
    expect(view).not.toHaveProperty('solution');
    expect(view).not.toHaveProperty('result');
    expect(view.hints).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(sampleCase.hints[0].text);
  });
  it('includes the solution after the accusation', () => {
    const view = toPublicCase({ ...structuredClone(sampleCase), status: 'solved' });
    expect(view.solution.culpritId).toBe('s4');
  });
});
