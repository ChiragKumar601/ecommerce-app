import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the custom type scale from theme.css; otherwise it treats
 * `text-body` as a colour and drops `text-white` when both are present.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['display', 'h1', 'h2', 'h3', 'h4', 'body', 'small', 'caption'] } },
});

/** Joins class names and resolves Tailwind conflicts (later wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
