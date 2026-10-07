import { LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { logout } from '../../features/session';
import { errorMessage } from '../../lib/api-client';
import { ConfirmDialog } from '../ui/overlay';
import { toast } from '../ui/toast';

/** Logout with confirmation (AUTH-013): revokes the session, clears account data, goes to `/`. */
export function LogoutButton({ className, children }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children ?? (<><LogOut className="size-5" aria-hidden="true" />Log out</>)}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Log out?"
        description="You'll need to log in again to see your orders, bag and wishlist."
        confirmLabel="Log out"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await logout();
            setOpen(false);
            navigate('/', { replace: true });
          } catch (e) {
            toast({ title: errorMessage(e), tone: 'danger' });
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
