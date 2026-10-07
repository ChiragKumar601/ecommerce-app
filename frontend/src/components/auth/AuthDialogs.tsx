import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { markSignedOut, subscribeNotice, takeNotice } from '../../features/session';
import { ApiError, setUnauthorizedHandler } from '../../lib/api-client';
import { saveIntent } from '../../lib/intent-resume';
import { Button } from '../ui/button';
import { InlineMessage } from '../ui/feedback';
import { Dialog } from '../ui/overlay';
import { LoginForm } from './LoginForm';

// ── Login prompt for guests (AUTH-020) ───────────────────────────────────────

interface Prompt {
  action: string;
  payload?: unknown;
  title?: string;
}
let prompt: Prompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Asks a guest to log in or sign up; the action resumes with the same inputs afterwards. */
export function promptLogin(p: Prompt) {
  prompt = p;
  emit();
}

function LoginPromptDialog() {
  const current = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => prompt);
  const location = useLocation();
  const navigate = useNavigate();
  const close = () => {
    prompt = null;
    emit();
  };
  const go = (to: 'login' | 'signup') => {
    if (!current) return;
    const returnTo = location.pathname + location.search;
    saveIntent(current.action, current.payload, returnTo);
    close();
    navigate(`/${to}?returnTo=${encodeURIComponent(returnTo)}`);
  };
  return (
    <Dialog
      open={!!current}
      onOpenChange={(o) => !o && close()}
      title={current?.title ?? 'Log in to continue'}
      description="Log in or create an account to carry on. We'll bring you right back."
      footer={
        <>
          <Button variant="secondary" onClick={() => go('signup')}><UserPlus className="size-4" aria-hidden="true" />Sign up</Button>
          <Button onClick={() => go('login')}><LogIn className="size-4" aria-hidden="true" />Log in</Button>
        </>
      }
    />
  );
}

// ── Session expiry (AUTH-011, PR-21) ─────────────────────────────────────────

/**
 * When a request fails with SESSION_EXPIRED, the login dialog opens on the current page. After a
 * successful login the interrupted request is sent again (with the same idempotency key); the bag
 * and the page state are kept. Dismissing the dialog fails the request with the original error.
 */
function SessionExpiredDialog() {
  const [pending, setPending] = useState<{ retry: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void; error: ApiError }[]>([]);
  useEffect(() => {
    setUnauthorizedHandler((error, retry) => {
      markSignedOut();
      return new Promise((resolve, reject) => setPending((p) => [...p, { retry, resolve, reject, error }]));
    });
    return () => setUnauthorizedHandler(null);
  }, []);
  const open = pending.length > 0;
  const finish = async () => {
    const waiting = pending;
    setPending([]);
    for (const w of waiting) w.retry().then(w.resolve, w.reject);
  };
  const dismiss = () => {
    const waiting = pending;
    setPending([]);
    for (const w of waiting) w.reject(w.error);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()} title="Please log in again">
      <InlineMessage tone="info" className="mb-4">Your session has expired. Please log in again.</InlineMessage>
      <LoginForm onSuccess={finish} autoFocus />
    </Dialog>
  );
}

// ── Password-change notice at the next login (AUTH-010) ──────────────────────

function PasswordNoticeDialog() {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const off = subscribeNotice(() => setNotice(takeNotice()));
    return () => void off();
  }, []);
  return (
    <Dialog
      open={!!notice}
      onOpenChange={(o) => !o && setNotice(null)}
      title="Your password was changed"
      footer={
        <>
          <Button variant="secondary" asChild><Link to="/forgot-password" onClick={() => setNotice(null)}>Reset it now</Link></Button>
          <Button onClick={() => setNotice(null)}>OK</Button>
        </>
      }
    >
      <p className="text-ink-soft">{notice}</p>
    </Dialog>
  );
}

/** Auth dialogs mounted once in the layout. */
export function AuthDialogs() {
  return (
    <>
      <LoginPromptDialog />
      <SessionExpiredDialog />
      <PasswordNoticeDialog />
    </>
  );
}
