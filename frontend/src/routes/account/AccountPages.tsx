import { GENDERS, profileSchema, SUPPORT_TYPE_LABELS, SUPPORT_TYPES, supportRequestSchema } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CreditCard, Gift, Heart, LifeBuoy, LogOut, MapPin, Package, Pencil, Star, Trash2, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CardFields, DemoCardWarning, RedeemGiftCardForm } from '../../components/account/forms';
import { LogoutButton } from '../../components/auth/LogoutButton';
import { PasswordInput } from '../../components/auth/LoginForm';
import { Accordion, Badge, Button, ConfirmDialog, Dialog, EmptyState, ErrorState, FormField, InlineMessage, Input, PageLayout, Select, Skeleton, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toast';
import { addCard, meKeys, useCards, useCredits, useGiftCards, useProfile, useSupportRequests, type Profile } from '../../features/account';
import { useSession } from '../../features/session';
import { api, errorMessage, newIdempotencyKey } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { qk, queryClient } from '../../lib/query';
import { useZodForm } from '../../lib/use-form';

/** Shared frame for account sub-pages: back link, title, consistent width (plan §8.5). */
function AccountFrame({ title, subtitle, children, actions }: { title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <PageLayout narrow>
      <Link to="/account" className="mb-3 inline-flex min-h-9 items-center gap-1 text-small font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />My account</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2 font-bold md:text-h1">{title}</h1>
          {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </PageLayout>
  );
}

const ListSkeleton = () => <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;

// ── Profile home (PRF-001, PRF-007) ──────────────────────────────────────────

export function AccountHome() {
  const s = useSession().data;
  if (!s?.authenticated) return null;
  const a = s.account;
  const entries: { to: string; label: string; hint: string; icon: ReactNode; dot?: boolean }[] = [
    { to: '/account/orders', label: 'Orders', hint: 'Track, cancel or return', icon: <Package className="size-5" aria-hidden="true" />, dot: s.hasUnseenOrderUpdates },
    { to: '/wishlist', label: 'Wishlist', hint: 'Items you saved', icon: <Heart className="size-5" aria-hidden="true" /> },
    { to: '/account/gift-cards', label: 'Gift Cards', hint: 'Redeem and check balances', icon: <Gift className="size-5" aria-hidden="true" /> },
    { to: '/account/credits', label: 'Credits', hint: 'Balance and history', icon: <Wallet className="size-5" aria-hidden="true" /> },
    { to: '/account/cards', label: 'Saved Cards', hint: 'Manage demo cards', icon: <CreditCard className="size-5" aria-hidden="true" /> },
    { to: '/account/addresses', label: 'Saved Addresses', hint: 'Where we deliver', icon: <MapPin className="size-5" aria-hidden="true" /> },
    { to: '/account/support', label: 'Contact Us', hint: 'FAQs and help requests', icon: <LifeBuoy className="size-5" aria-hidden="true" /> },
  ];
  return (
    <PageLayout narrow>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5 shadow-1">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-h3 font-bold text-brand" aria-hidden="true">{a.name.charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <h1 className="truncate text-h3 font-bold">{a.name}</h1>
            <p className="truncate text-small text-ink-muted">{[a.email, a.phone].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <Button asChild variant="secondary" size="sm"><Link to="/account/profile"><Pencil className="size-4" aria-hidden="true" />Edit Profile</Link></Button>
      </div>
      <nav aria-label="Account sections">
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((e) => (
            <li key={e.to}>
              <Link to={e.to} className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink" aria-label={e.dot ? `${e.label}, new updates` : undefined}>
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink">
                  {e.icon}
                  {e.dot && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-surface" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{e.label}</span>
                  <span className="block truncate text-small text-ink-muted">{e.hint}</span>
                </span>
                <ChevronRight className="size-4 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <LogoutButton className="flex w-full items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-ink">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted"><LogOut className="size-5" aria-hidden="true" /></span>
              <span className="font-semibold">Log out</span>
            </LogoutButton>
          </li>
        </ul>
      </nav>
    </PageLayout>
  );
}

// ── Edit Profile (PRF-002) ───────────────────────────────────────────────────

const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = { female: 'Female', male: 'Male', other: 'Other', prefer_not_to_say: 'Prefer not to say' };
const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function ProfileForm({ p }: { p: Profile }) {
  const questions = useQuery({ queryKey: ['security-questions'], queryFn: () => api<{ id: string; text: string }[]>('/auth/security-questions'), staleTime: 5 * 60_000 });
  const f = useZodForm(profileSchema(todayIst()), {
    name: p.name, email: p.email ?? '', phone: p.phone?.replace(/^\+91/, '') ?? '', gender: p.gender ?? '', dateOfBirth: p.dateOfBirth ?? '',
    currentPassword: '', newPassword: '', confirmNewPassword: '', securityQuestionId: '', securityAnswer: '',
  }, { clearOnError: ['currentPassword', 'newPassword', 'confirmNewPassword'] });
  const v = f.values;
  const sensitive = v.email !== (p.email ?? '') || v.phone !== (p.phone?.replace(/^\+91/, '') ?? '') || !!v.newPassword || !!v.securityQuestionId;
  return (
    <form {...f.formProps(async () => {
      const updated = await api<Profile>('/me', { method: 'PATCH', body: f.values });
      queryClient.setQueryData(meKeys.profile, updated);
      void queryClient.invalidateQueries({ queryKey: ['session'] });
      for (const k of ['currentPassword', 'newPassword', 'confirmNewPassword', 'securityQuestionId', 'securityAnswer'] as const) f.set(k, '');
      toast({ title: 'Profile updated', tone: 'success' });
    })} className="flex flex-col gap-5">
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-h4 font-semibold">Personal details</h2>
        <FormField label="Full name" error={f.errors['name']} required><Input {...f.field('name')} autoComplete="name" /></FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Gender" error={f.errors['gender']}>
            <Select {...f.field('gender')}>
              <option value="">Not specified</option>
              {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
            </Select>
          </FormField>
          <FormField label="Date of birth" error={f.errors['dateOfBirth']} hint="Optional. You must be 18 or older.">
            <Input {...f.field('dateOfBirth')} type="date" max={todayIst()} />
          </FormField>
        </div>
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-h4 font-semibold">Sign-in details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Email" error={f.errors['email']}><Input {...f.field('email')} type="email" autoComplete="email" /></FormField>
          <FormField label="Mobile number" error={f.errors['phone']}><Input {...f.field('phone')} type="tel" autoComplete="tel-national" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="New password" error={f.errors['newPassword']} hint="Leave blank to keep your password"><PasswordInput {...f.field('newPassword')} autoComplete="new-password" /></FormField>
          <FormField label="Confirm new password" error={f.errors['confirmNewPassword']}><PasswordInput {...f.field('confirmNewPassword')} autoComplete="new-password" /></FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Security question" error={f.errors['securityQuestionId']} hint={p.securityQuestion ? `Current: ${p.securityQuestion.text}` : undefined}>
            <Select {...f.field('securityQuestionId')}>
              <option value="">Keep current question</option>
              {questions.data?.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
            </Select>
          </FormField>
          <FormField label="New answer" error={f.errors['securityAnswer']}><Input {...f.field('securityAnswer')} autoComplete="off" disabled={!v.securityQuestionId} /></FormField>
        </div>
        {sensitive && (
          <FormField label="Current password" error={f.errors['currentPassword']} hint="Needed to change your email, phone, password or security question" required>
            <PasswordInput {...f.field('currentPassword')} autoComplete="current-password" />
          </FormField>
        )}
      </section>
      <Button type="submit" size="lg" loading={f.submitting} className="self-start">Save changes</Button>
    </form>
  );
}

export function EditProfilePage() {
  const p = useProfile();
  return (
    <AccountFrame title="Edit Profile">
      {p.data ? <ProfileForm p={p.data} /> : p.isError ? <ErrorState message={errorMessage(p.error)} onRetry={() => void p.refetch()} /> : <ListSkeleton />}
    </AccountFrame>
  );
}

// ── Credits (PRF-003) ────────────────────────────────────────────────────────

export function CreditsPage() {
  const [page, setPage] = useState(1);
  const c = useCredits(page);
  return (
    <AccountFrame title="Credits" subtitle="Credits never expire and can be used at checkout.">
      {c.isError && !c.data ? <ErrorState message={errorMessage(c.error)} onRetry={() => void c.refetch()} /> : !c.data ? <ListSkeleton /> : (
        <>
          <div className="mb-6 rounded-xl bg-ink p-6 text-white shadow-2">
            <p className="text-small font-semibold uppercase tracking-wider text-white/70">Available balance</p>
            <p className="tabular mt-1 text-display font-bold">{c.data.balance.display}</p>
          </div>
          {c.data.entries.length === 0 ? <EmptyState title="No credit activity yet" /> : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {c.data.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{e.description}</p>
                    <p className="text-caption text-ink-muted">{e.date}{e.order && <> · <Link to={`/account/orders/${e.order.id}`} className="underline">{e.order.number ?? 'View order'}</Link></>}</p>
                  </div>
                  <p className={cn('tabular shrink-0 font-semibold', e.amount.paise > 0 ? 'text-success' : 'text-ink')}>{e.amount.paise > 0 ? '+' : ''}{e.amount.display}</p>
                </li>
              ))}
            </ul>
          )}
          {c.data.pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
              <span className="text-small text-ink-muted">Page {page} of {c.data.pageCount}</span>
              <Button variant="secondary" size="sm" disabled={page >= c.data.pageCount} onClick={() => setPage((p) => p + 1)}>Older</Button>
            </div>
          )}
        </>
      )}
    </AccountFrame>
  );
}

// ── Gift cards (PRF-004) ─────────────────────────────────────────────────────

const STATUS_TONE = { active: 'success', exhausted: 'neutral', expired: 'danger' } as const;

export function GiftCardsPage() {
  const g = useGiftCards();
  return (
    <AccountFrame title="Gift Cards" subtitle={<>Redeem a demo code to add it to your account. Codes are on <Link to="/demo-help" className="underline">Demo help</Link>.</>}>
      <section className="mb-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-h4 font-semibold">Redeem gift card</h2>
        <RedeemGiftCardForm />
      </section>
      {g.isError && !g.data ? <ErrorState message={errorMessage(g.error)} onRetry={() => void g.refetch()} /> : !g.data ? <ListSkeleton /> : g.data.items.length === 0 ? (
        <EmptyState icon={<Gift className="size-7" aria-hidden="true" />} title="No gift cards yet" description="Redeemed gift cards appear here with their balance and expiry." />
      ) : (
        <ul className="flex flex-col gap-3">
          {g.data.items.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold tracking-wide">{c.maskedCode}</p>
                  <p className="text-caption text-ink-muted">{c.status === 'expired' ? 'Expired on' : 'Valid until'} {c.expiresOn}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={STATUS_TONE[c.status]} size="md">{c.status === 'active' ? 'Active' : c.status === 'exhausted' ? 'Used up' : 'Expired'}</Badge>
                  <p className="tabular text-h4 font-bold">{c.balance.display}</p>
                </div>
              </div>
              <Accordion className="mt-2" items={[{
                value: 'tx', title: <span className="text-small">Transactions ({c.transactions.length})</span>,
                content: (
                  <ul className="flex flex-col gap-2 text-small">
                    {c.transactions.map((t) => (
                      <li key={t.id} className="flex justify-between gap-3">
                        <span>{t.description} <span className="text-ink-muted">· {t.date}</span></span>
                        <span className={cn('tabular font-medium', t.amount.paise > 0 && 'text-success')}>{t.amount.paise > 0 ? '+' : ''}{t.amount.display}</span>
                      </li>
                    ))}
                  </ul>
                ),
              }]} />
            </li>
          ))}
        </ul>
      )}
    </AccountFrame>
  );
}

// ── Saved cards (PRF-005) ────────────────────────────────────────────────────

export function SavedCardsPage() {
  const c = useCards();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (path: string, method: 'POST' | 'DELETE') => {
    setBusy(true);
    try {
      queryClient.setQueryData(meKeys.cards, await api(path, { method }));
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };
  const full = (c.data?.items.length ?? 0) >= 5;
  return (
    <AccountFrame title="Saved Cards" subtitle="Only demo test cards can be saved. We never store the full number or CVV." actions={<Button onClick={() => setAdding(true)} disabled={full}><CreditCard className="size-4" aria-hidden="true" />Add card</Button>}>
      {full && <InlineMessage tone="info" className="mb-4">You can save up to 5 cards. Remove one to add another.</InlineMessage>}
      {c.isError && !c.data ? <ErrorState message={errorMessage(c.error)} onRetry={() => void c.refetch()} /> : !c.data ? <ListSkeleton /> : c.data.items.length === 0 ? (
        <EmptyState icon={<CreditCard className="size-7" aria-hidden="true" />} title="No saved cards" description="Save a demo card for faster checkout." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {c.data.items.map((card) => (
            <li key={card.id} className={cn('flex flex-col gap-3 rounded-xl border p-4', card.isDefault ? 'border-ink bg-surface shadow-1' : 'border-line bg-surface')}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{card.label}</p>
                  <p className="text-small text-ink-muted">{card.issuingBank} · {card.cardType === 'credit' ? 'Credit' : 'Debit'}</p>
                </div>
                <div className="flex gap-1.5">
                  {card.isDefault && <Badge tone="solid">Default</Badge>}
                  {card.expired && <Badge tone="danger">Expired</Badge>}
                </div>
              </div>
              <p className="text-small text-ink-soft">{card.nameOnCard} · Expires {card.expiry}</p>
              <div className="mt-auto flex gap-2">
                {!card.isDefault && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(`/me/cards/${card.id}/default`, 'POST')}><Star className="size-4" aria-hidden="true" />Set default</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(card.id)} aria-label={`Remove ${card.label}`}><Trash2 className="size-4" aria-hidden="true" />Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title="Add a card">
        <div className="flex flex-col gap-4">
          <DemoCardWarning />
          <CardFields submitLabel="Save card" onSubmit={async (d) => {
            await addCard(d);
            setAdding(false);
            toast({ title: 'Card saved', tone: 'success' });
          }} />
        </div>
      </Dialog>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove this card?" description="You can add it again later." confirmLabel="Remove" tone="danger" loading={busy} onConfirm={() => void act(`/me/cards/${removing}`, 'DELETE')} />
    </AccountFrame>
  );
}

// ── Contact Us (PRF-006) ─────────────────────────────────────────────────────

function SupportForm() {
  const [key, setKey] = useState(newIdempotencyKey);
  const [done, setDone] = useState<string | null>(null);
  const orders = useQuery({ queryKey: ['orders', 'options'], queryFn: () => api<{ items: { id: string; orderNumber: string }[] }>('/orders?pageSize=50').catch(() => ({ items: [] })), staleTime: 60_000 });
  const f = useZodForm(supportRequestSchema, { type: '', orderId: '', message: '' });
  return (
    <form {...f.formProps(async () => {
      const r = await api<{ message: string }>('/me/support-requests', { method: 'POST', body: f.values, idempotencyKey: key });
      setKey(newIdempotencyKey());
      setDone(r.message);
      f.set('message', '');
      await queryClient.invalidateQueries({ queryKey: meKeys.support });
    })} className="flex flex-col gap-4">
      {f.formError && <InlineMessage>{f.formError}</InlineMessage>}
      {done && <InlineMessage tone="success">{done}</InlineMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Request type" error={f.errors['type']} required>
          <Select {...f.field('type')}>
            <option value="">Choose a type</option>
            {SUPPORT_TYPES.map((t) => <option key={t} value={t}>{SUPPORT_TYPE_LABELS[t]}</option>)}
          </Select>
        </FormField>
        <FormField label="Order (optional)" error={f.errors['orderId']}>
          <Select {...f.field('orderId')}>
            <option value="">Not about an order</option>
            {orders.data?.items.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField label="Message" error={f.errors['message']} hint={`${f.values.message.trim().length}/1,000 characters`} required>
        <Textarea {...f.field('message')} rows={5} maxLength={1000} />
      </FormField>
      <Button type="submit" loading={f.submitting} className="self-start">Submit request</Button>
    </form>
  );
}

export function ContactUsPage() {
  const faqs = useQuery({ queryKey: qk.faqs, queryFn: () => api<{ topic: string; items: { id: string; question: string; answer: string }[] }[]>('/faqs'), staleTime: 5 * 60_000 });
  const requests = useSupportRequests();
  return (
    <AccountFrame title="Contact Us" subtitle="Find a quick answer, or send us a request.">
      <section aria-labelledby="faq-h" className="mb-8">
        <h2 id="faq-h" className="mb-3 text-h3 font-semibold">Frequently asked questions</h2>
        {faqs.data ? faqs.data.map((t) => (
          <div key={t.topic} className="mb-4">
            <h3 className="mb-1 text-small font-bold uppercase tracking-wider text-ink-muted">{t.topic}</h3>
            <Accordion type="single" items={t.items.map((q) => ({ value: q.id, title: q.question, content: <p>{q.answer}</p> }))} />
          </div>
        )) : <ListSkeleton />}
      </section>
      <section aria-labelledby="sr-h" className="mb-8 rounded-lg border border-line bg-surface p-5">
        <h2 id="sr-h" className="mb-4 text-h3 font-semibold">Send a request</h2>
        <SupportForm />
      </section>
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="mb-3 text-h3 font-semibold">Your requests</h2>
        {!requests.data ? <ListSkeleton /> : requests.data.items.length === 0 ? <p className="text-ink-muted">You haven't sent any requests yet.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {requests.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{r.requestNumber} · {r.typeLabel}</p>
                  <p className="line-clamp-2 text-small text-ink-soft">{r.message}</p>
                  <p className="text-caption text-ink-muted">{r.date}</p>
                </div>
                <Badge tone="info" size="md">{r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountFrame>
  );
}
