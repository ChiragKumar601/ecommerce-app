import { loginSchema } from '@app/shared';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router';
import { login } from '../../features/session';
import { useZodForm } from '../../lib/use-form';
import { Button } from '../ui/button';
import { InlineMessage } from '../ui/feedback';
import { FormField, Input } from '../ui/input';

/** Password input with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} className="pr-12" {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
      >
        {shown ? <EyeOff className="size-4.5" aria-hidden="true" /> : <Eye className="size-4.5" aria-hidden="true" />}
      </button>
    </div>
  );
});

/**
 * Login (AUTH-004…006, AUTH-016). Used by the login page and the session-expired dialog.
 * Every failure shows the same server message (AUTH-005); the password is cleared after an error.
 */
export function LoginForm({ onSuccess, signupHref = '/signup', autoFocus }: { onSuccess: () => void | Promise<void>; signupHref?: string; autoFocus?: boolean }) {
  const f = useZodForm(loginSchema, { identifier: '', password: '' }, { clearOnError: ['password'] });
  return (
    <form {...f.formProps(async (d) => {
      await login(f.values.identifier.trim(), d.password);
      await onSuccess();
    })} className="flex flex-col gap-4">
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      <FormField label="Email or mobile number" error={f.errors['identifier']} required>
        <Input {...f.field('identifier')} autoComplete="username" inputMode="email" autoFocus={autoFocus} placeholder="you@example.com or 98765 43210" />
      </FormField>
      <FormField label="Password" error={f.errors['password']} required>
        <PasswordInput {...f.field('password')} autoComplete="current-password" />
      </FormField>
      <div className="-mt-1 text-right">
        <Link to="/forgot-password" className="text-small font-semibold text-brand hover:underline">Forgot password?</Link>
      </div>
      <Button type="submit" size="lg" block loading={f.submitting}>Log in</Button>
      <p className="text-center text-small text-ink-muted">
        New here? <Link to={signupHref} className="font-semibold text-ink underline-offset-2 hover:underline">Create an account</Link>
      </p>
    </form>
  );
}
