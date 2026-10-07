import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-md border border-line-strong bg-surface px-3.5 text-body text-ink placeholder:text-ink-muted transition-colors duration-150 hover:border-ink-muted focus-visible:border-ink focus-visible:outline-2 disabled:cursor-not-allowed disabled:bg-surface-muted aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-11', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2.5', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2316161a%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] bg-[position:right_0.75rem_center] bg-no-repeat pr-10', className)} {...props}>
      {children}
    </select>
  );
});

/**
 * Label + control + hint + error, with ids linked for screen readers (AUTH-016, FE-004).
 * The single child control receives id, aria-invalid and aria-describedby.
 */
export function FormField({ label, hint, error, children, className, required }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactElement; className?: string; required?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-small font-semibold text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden="true"> *</span>}
      </label>
      {child}
      {hint && !error && <p id={hintId} className="text-caption text-ink-muted">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: CheckboxPrimitive.CheckboxProps & { label?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <CheckboxPrimitive.Root
        id={id}
        className="flex size-5 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-surface transition-colors hover:border-ink data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-white"
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label htmlFor={id} className="cursor-pointer select-none text-body">
          {label}
        </label>
      )}
    </div>
  );
}

export function RadioGroup({ options, className, ...props }: RadioPrimitive.RadioGroupProps & { options: { value: string; label: ReactNode; disabled?: boolean }[] }) {
  const base = useId();
  return (
    <RadioPrimitive.Root className={cn('flex flex-col gap-2.5', className)} {...props}>
      {options.map((o) => (
        <div key={o.value} className="flex items-center gap-2.5">
          <RadioPrimitive.Item
            id={`${base}-${o.value}`}
            value={o.value}
            disabled={o.disabled}
            className="flex size-5 items-center justify-center rounded-full border border-line-strong bg-surface hover:border-ink disabled:opacity-50 data-[state=checked]:border-ink"
          >
            <RadioPrimitive.Indicator className="size-2.5 rounded-full bg-ink" />
          </RadioPrimitive.Item>
          <label htmlFor={`${base}-${o.value}`} className="cursor-pointer select-none">
            {o.label}
          </label>
        </div>
      ))}
    </RadioPrimitive.Root>
  );
}

export function Switch({ label, className, ...props }: SwitchPrimitive.SwitchProps & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <SwitchPrimitive.Root id={id} className="relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink" {...props}>
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-1 transition-transform duration-200 ease-standard data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}

export function Label(props: InputHTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label {...props} className={cn('text-small font-semibold text-ink', props.className)} />;
}
