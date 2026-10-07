import { LogoutButton } from '../../components/auth/LogoutButton';
import { PageHeader, PageLayout } from '../../components/ui';
import { useAccount } from '../../features/session';

/** Profile home (PRF-001). The account sections are added in Stage 12. */
export function AccountHome() {
  const account = useAccount();
  if (!account) return null;
  return (
    <PageLayout narrow>
      <PageHeader title={`Hi, ${account.name.split(' ')[0]}`} subtitle={[account.email, account.phone].filter(Boolean).join(' · ')} />
      <LogoutButton className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-5 font-semibold hover:border-ink" />
    </PageLayout>
  );
}
