/**
 * better-auth catches database failures and logs a generic sentence — the
 * OAuth callback turns any error from the `users` insert into "Unable to
 * create OAuth user". It passes the original error along as an extra argument,
 * but `console.error(msg, err)` on Workers only keeps the stack, and a D1
 * error's stack does not repeat its message, so the one line that says what
 * actually went wrong ("no such column: stripe_customer_id") never reaches the
 * log. Flatten every Error argument to text so the cause survives.
 */
export function describeLogArg(arg: unknown): unknown {
  if (!(arg instanceof Error)) return arg;
  const parts = [`${arg.name}: ${arg.message}`];
  if (arg.cause instanceof Error) parts.push(`caused by ${arg.cause.name}: ${arg.cause.message}`);
  else if (arg.cause !== undefined) parts.push(`caused by ${String(arg.cause)}`);
  if (arg.stack) parts.push(arg.stack);
  return parts.join(" | ");
}
