import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { compose, parse, serialize, splitDocument, protect } = createRequire(import.meta.url)(
  '../src/common/leanDocument.js'
);

const FIX = [
  'namespace StatechartDomain',
  'structure StateChart extends FCO where',
  '  name : String'
].join('\n') + '\n';

const PROGRAM = compose(FIX, '');

describe('lean document', () => {
  it('joins the parts into one program', () => {
    const text = compose(FIX, 'def ok : Bool := true');
    expect(text).not.toContain('-- user defined');
    expect(text).not.toContain('-- @generated-end');
    expect(text.indexOf('structure StateChart')).toBeLessThan(text.indexOf('def ok : Bool := true'));
    expect(text.indexOf('def ok : Bool := true')).toBeLessThan(text.indexOf('end StatechartDomain'));
    expect(compose(splitDocument(text, FIX)!.fix, splitDocument(text, FIX)!.user)).toBe(text);
  });

  it('round-trips the two parts through the program text', () => {
    const text = compose(FIX, 'def ok : Bool := true');
    expect(splitDocument(text, FIX)).toEqual({
      fix: FIX,
      user: 'def ok : Bool := true'
    });
  });

  it('converts the registry string to parts and back', () => {
    const stored = serialize({ fix: FIX, user: 'def ok : Bool := true' });
    expect(typeof stored).toBe('string');
    expect(JSON.parse(stored)).toEqual({ fix: FIX, user: 'def ok : Bool := true' });
    expect(parse(stored)).toEqual({ fix: FIX, user: 'def ok : Bool := true' });
    expect(parse('')).toEqual({ fix: '', user: '' });
    expect(compose(parse(stored).fix, parse(stored).user)).not.toContain('"fix"');
  });

  it('keeps an edit that follows the generated text', () => {
    const next = compose(FIX, 'def ok : Bool := true');
    expect(protect(FIX, '', next)).toBe(next);
  });

  it('restores a change in the generated text and keeps the user text', () => {
    const edited = compose(FIX, 'def ok : Bool := true').replace('structure StateChart', 'structure Changed');
    const fixed = protect(FIX, 'def ok : Bool := true', edited);
    expect(fixed).toContain('structure StateChart');
    expect(fixed).not.toContain('structure Changed');
    expect(fixed).toContain('def ok : Bool := true');
    expect(fixed).toContain('end StatechartDomain');
  });

  it('restores the closing end line', () => {
    const edited = PROGRAM.replace('end StatechartDomain', 'end Other');
    const fixed = protect(FIX, '', edited);
    expect(fixed).toContain('end StatechartDomain');
    expect(fixed).not.toContain('end Other');
  });
});
