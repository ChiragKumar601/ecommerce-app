import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export { FormField, Input, Select, Textarea } from './input';

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
