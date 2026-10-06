import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';

describe('@app/shared', () => {
  it('exposes a module', () => {
    expect(shared).toBeTypeOf('object');
  });
});
