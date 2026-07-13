// Map raw Supabase auth errors to user-facing text. Auth emails (password
// recovery, confirmations) share the built-in sender's small hourly quota, so
// the rate-limit case needs a message that explains itself.
export function authErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/rate limit|too many/i.test(message)) {
    return 'Too many emails sent right now — please try again in about an hour.'
  }
  return message
}
