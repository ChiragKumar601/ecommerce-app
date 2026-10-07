import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import type { z } from 'zod';
import { ApiError, errorMessage } from './api-client';

type Values = Record<string, unknown>;

function check<S extends z.ZodType>(schema: S, v: Values) {
  const r = schema.safeParse(v);
  const issues: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) issues[i.path.join('.') || '_'] ??= i.message;
  return { ok: r.success, data: r.success ? (r.data as z.output<S>) : null, issues };
}

/**
 * Forms validated with the shared zod schemas (VAL-001, AUTH-016): a field is checked on blur and
 * every field on submit; field-level messages; server field errors map onto the same fields; the
 * submit trigger is disabled while the request is in flight (GLB-004). Input is kept after errors,
 * except the fields listed in `clearOnError` (passwords, CVVs, OTPs — ERR-001).
 */
export function useZodForm<S extends z.ZodType, V extends Values>(schema: S, initial: V, opts: { clearOnError?: (keyof V)[] } = {}) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formId = useId();

  const set = <K extends keyof V>(name: K, value: V[K]) => {
    const next = { ...values, [name]: value };
    setValues(next);
    // A field already showing an error is re-checked, so the message clears as soon as it's fixed.
    if (errors[name as string]) setErrors((e) => ({ ...e, [name]: check(schema, next).issues[name as string] }));
  };

  /** Props for a text-like control bound to `name`. */
  const field = (name: keyof V & string) => ({
    name,
    value: String(values[name] ?? ''),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(name, e.target.value as V[typeof name]),
    onBlur: () => setErrors((e) => ({ ...e, [name]: check(schema, values).issues[name] })),
  });

  const focusFirstError = () =>
    requestAnimationFrame(() => document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const applyServerError = (e: unknown) => {
    if (e instanceof ApiError && e.fieldErrors.length) {
      const next: Record<string, string> = {};
      for (const f of e.fieldErrors) next[f.field] ??= f.message;
      setErrors(next);
      setFormError(Object.keys(next).some((k) => k in values) ? null : e.message);
      focusFirstError();
    } else {
      setFormError(errorMessage(e));
    }
    if (opts.clearOnError?.length) {
      setValues((v) => {
        const cleared = { ...v };
        for (const k of opts.clearOnError!) cleared[k] = '' as V[typeof k];
        return cleared;
      });
    }
  };

  const handleSubmit = (fn: (data: z.output<S>) => Promise<unknown>) => async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (submitting) return;
    const { ok, data, issues } = check(schema, values);
    setErrors(issues);
    setFormError(null);
    if (!ok) {
      focusFirstError();
      return;
    }
    setSubmitting(true);
    try {
      await fn(data!);
    } catch (e) {
      applyServerError(e);
    } finally {
      setSubmitting(false);
    }
  };

  /** Spread onto the <form>: links the form for focus management and turns off native validation. */
  const formProps = (fn: (data: z.output<S>) => Promise<unknown>) => ({ id: formId, noValidate: true, onSubmit: handleSubmit(fn) });

  return { values, set, field, errors, setErrors, formError, setFormError, submitting, formProps, applyServerError };
}
