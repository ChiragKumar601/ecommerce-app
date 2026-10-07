import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backendRoot = resolve(import.meta.dirname, '..');

// The compiled backend runs on plain Node (no bundler), so @app/shared must load there too (plan §4.3).
describe('@app/shared at runtime on plain Node', () => {
  it('loads schemas and types without a bundler', () => {
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "const m = await import('@app/shared'); console.log(String(m.ERROR_CODES.length) + ' ' + m.normalizePhone('09876543210'));"],
      { cwd: backendRoot, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('42 +919876543210');
  });
});
