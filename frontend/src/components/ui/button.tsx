import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './feedback';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-standard focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-white hover:bg-ink-soft shadow-1',
        brand: 'bg-brand text-on-brand hover:bg-brand-hover shadow-1',
        secondary: 'bg-surface text-ink border border-line-strong hover:border-ink hover:bg-surface-muted',
        ghost: 'bg-transparent text-ink hover:bg-surface-muted',
        link: 'bg-transparent text-ink underline-offset-4 hover:underline px-0 h-auto',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        sm: 'h-9 rounded-md px-3 text-small',
        md: 'h-11 rounded-md px-5 text-body',
        lg: 'h-12 rounded-lg px-7 text-body',
        icon: 'size-11 rounded-full p-0',
        'icon-sm': 'size-9 rounded-full p-0',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button while an action is in flight (GLB-004). */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Spinner className="size-4" label="" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  /** Required accessible name for icon-only buttons (FE-004). */
  label: string;
  size?: 'icon' | 'icon-sm';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = 'icon', variant = 'ghost', ...props }, ref) {
  return <Button ref={ref} aria-label={label} title={label} size={size} variant={variant} {...props} />;
});
