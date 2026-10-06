import { AppError } from '../errors.js';

export interface Transition<S extends string, E extends string, C> {
  from: readonly S[];
  event: E;
  to: S;
  /** Optional condition on the context (e.g. delivery attempt number). */
  guard?: (ctx: C) => boolean;
}

export interface Machine<S extends string, E extends string, C> {
  readonly transitions: readonly Transition<S, E, C>[];
  /** Whether `event` is allowed from `state`. */
  can(state: S, event: E, ctx?: C): boolean;
  /** The next state, or `ACTION_NOT_ALLOWED` if the transition isn't listed (spec §7). */
  next(state: S, event: E, ctx?: C): S;
}

/** Declarative state machine: only listed transitions are allowed (spec §7 preamble). */
export function defineMachine<S extends string, E extends string, C = undefined>(
  transitions: readonly Transition<S, E, C>[],
): Machine<S, E, C> {
  const find = (state: S, event: E, ctx?: C) =>
    transitions.find((t) => t.event === event && t.from.includes(state) && (!t.guard || t.guard(ctx as C)));
  return {
    transitions,
    can: (state, event, ctx) => find(state, event, ctx) !== undefined,
    next(state, event, ctx) {
      const t = find(state, event, ctx);
      if (!t) throw new AppError('ACTION_NOT_ALLOWED', { from: state, event });
      return t.to;
    },
  };
}
