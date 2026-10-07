import { resetCompleteSchema, resetVerifySchema, signupSchema } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LoginForm, PasswordInput } from '../../components/auth/LoginForm';
import { Button, Checkbox, FormField, InlineMessage, Input, PageLayout, Select } from '../../components/ui';
import { returnToFrom, signup } from '../../features/session';
import { api } from '../../lib/api-client';
import { resumeIntent } from '../../lib/intent-resume';
import { useZodForm } from '../../lib/use-form';

/** Shared frame for the auth pages: one centred card, the same on every width (plan §8.5). */
function AuthCard({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <PageLayout className="flex justify-center">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-1 sm:p-8">
          <h1 className="text-h2 font-bold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {aside && <div className="mt-4">{aside}</div>}
      </div>
    </PageLayout>
  );
}

const useSecurityQuestions = () =>
  useQuery({ queryKey: ['security-questions'], queryFn: () => api<{ id: string; text: string }[]>('/auth/security-questions'), staleTime: 5 * 60_000 });

/** After login or sign-up: carry on with the interrupted action, or return to the requested route (AUTH-015, AUTH-020). */
function useAfterAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  return async () => navigate(await resumeIntent(returnToFrom(location.search, '/')), { replace: true });
}

export function LoginPage() {
  const after = useAfterAuth();
  const { search } = useLocation();
  return (
    <AuthCard title="Log in" subtitle="Welcome back. Log in with your email or mobile number.">
      <LoginForm onSuccess={after} signupHref={`/signup${search}`} autoFocus />
    </AuthCard>
  );
}

export function SignupPage() {
  const after = useAfterAuth();
  const { search } = useLocation();
  const questions = useSecurityQuestions();
  const f = useZodForm(
    signupSchema,
    { name: '', email: '', phone: '', password: '', confirmPassword: '', securityQuestionId: '', securityAnswer: '', ageConfirmed: false as boolean },
    { clearOnError: ['password', 'confirmPassword'] },
  );
  return (
    <AuthCard
      title="Create your account"
      subtitle={<>Sign up with your email or mobile number. <span className="font-semibold text-ink">You'll get ₹500 in credits</span> to try the store.</>}
      aside={<p className="text-center text-small text-ink-muted">Already have an account? <Link to={`/login${search}`} className="font-semibold text-ink hover:underline">Log in</Link></p>}
    >
      <form {...f.formProps(async () => {
        await signup({ ...f.values });
        await after();
      })} className="flex flex-col gap-4">
        {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
        <FormField label="Full name" error={f.errors['name']} required>
          <Input {...f.field('name')} autoComplete="name" autoFocus />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" error={f.errors['email']} hint="Email or mobile, at least one">
            <Input {...f.field('email')} type="email" autoComplete="email" inputMode="email" />
          </FormField>
          <FormField label="Mobile number" error={f.errors['phone']}>
            <Input {...f.field('phone')} type="tel" autoComplete="tel-national" inputMode="tel" placeholder="10-digit mobile" />
          </FormField>
        </div>
        <FormField label="Password" error={f.errors['password']} hint="8–64 characters, with a letter and a number" required>
          <PasswordInput {...f.field('password')} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm password" error={f.errors['confirmPassword']} required>
          <PasswordInput {...f.field('confirmPassword')} autoComplete="new-password" />
        </FormField>
        <FormField label="Security question" error={f.errors['securityQuestionId']} hint="Used only to reset your password" required>
          <Select {...f.field('securityQuestionId')}>
            <option value="">Choose a question</option>
            {questions.data?.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
          </Select>
        </FormField>
        <FormField label="Your answer" error={f.errors['securityAnswer']} required>
          <Input {...f.field('securityAnswer')} autoComplete="off" />
        </FormField>
        <div>
          <Checkbox
            label="I am 18 or older"
            checked={f.values.ageConfirmed}
            onCheckedChange={(c) => f.set('ageConfirmed', c === true)}
            aria-invalid={f.errors['ageConfirmed'] ? true : undefined}
            aria-describedby={f.errors['ageConfirmed'] ? 'age-error' : undefined}
          />
          {f.errors['ageConfirmed'] && <p id="age-error" role="alert" className="mt-1.5 text-caption font-medium text-danger">{f.errors['ageConfirmed']}</p>}
        </div>
        <Button type="submit" size="lg" block loading={f.submitting}>Create account</Button>
        <p className="flex items-start gap-2 text-caption text-ink-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This is a demo store. Accounts with no activity for 30 days are deleted automatically.
        </p>
      </form>
    </AuthCard>
  );
}

/**
 * Password reset (AUTH-008, AUTH-009): identifier → the customer picks their question from the full
 * list and answers it → new password. Failures are neutral; the account's question is never shown.
 */
export function ForgotPasswordPage() {
  const questions = useSecurityQuestions();
  const [token, setToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const verify = useZodForm(resetVerifySchema, { identifier: '', securityQuestionId: '', securityAnswer: '' }, { clearOnError: ['securityAnswer'] });
  const complete = useZodForm(resetCompleteSchema, { resetToken: '', password: '', confirmPassword: '' }, { clearOnError: ['password', 'confirmPassword'] });

  if (done) {
    return (
      <AuthCard title="Password updated">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
          <p className="text-ink-soft">Your password has been changed and you've been logged out on every device.</p>
          <Button asChild size="lg" block className="mt-2"><Link to="/login">Log in</Link></Button>
        </div>
      </AuthCard>
    );
  }

  if (token) {
    return (
      <AuthCard title="Set a new password" subtitle="Choose a password you haven't used here before.">
        <form {...complete.formProps(async (d) => {
          await api('/auth/reset/complete', { method: 'POST', body: { resetToken: token, password: d.password, confirmPassword: d.confirmPassword } });
          setDone(true);
        })} className="flex flex-col gap-4">
          {complete.formError && <InlineMessage>{complete.formError}</InlineMessage>}
          <FormField label="New password" error={complete.errors['password']} hint="8–64 characters, with a letter and a number" required>
            <PasswordInput {...complete.field('password')} autoComplete="new-password" autoFocus />
          </FormField>
          <FormField label="Confirm new password" error={complete.errors['confirmPassword']} required>
            <PasswordInput {...complete.field('confirmPassword')} autoComplete="new-password" />
          </FormField>
          <Button type="submit" size="lg" block loading={complete.submitting}>Update password</Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your email or mobile number, then choose your security question and answer it.">
      <form {...verify.formProps(async () => {
        const r = await api<{ resetToken: string }>('/auth/reset/verify', { method: 'POST', body: verify.values });
        complete.set('resetToken', r.resetToken);
        setToken(r.resetToken);
      })} className="flex flex-col gap-4">
        {verify.formError && <InlineMessage>{verify.formError}</InlineMessage>}
        <FormField label="Email or mobile number" error={verify.errors['identifier']} required>
          <Input {...verify.field('identifier')} autoComplete="username" autoFocus />
        </FormField>
        <FormField label="Your security question" error={verify.errors['securityQuestionId']} hint="Pick the question you chose when you signed up" required>
          <Select {...verify.field('securityQuestionId')}>
            <option value="">Choose a question</option>
            {questions.data?.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
          </Select>
        </FormField>
        <FormField label="Your answer" error={verify.errors['securityAnswer']} required>
          <Input {...verify.field('securityAnswer')} autoComplete="off" />
        </FormField>
        <Button type="submit" size="lg" block loading={verify.submitting}>Continue</Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-small text-ink-muted">
          <Sparkles className="size-4" aria-hidden="true" />Remembered it? <Link to="/login" className="font-semibold text-ink hover:underline">Log in</Link>
        </p>
      </form>
    </AuthCard>
  );
}
