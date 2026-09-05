// DEEYOUNG PRO — server-side PostHog capture (env-gated, fire-and-forget).
// NEXT_PUBLIC_POSTHOG_KEY is the PostHog PROJECT API key (phc_...): the same key
// posthog-js uses in the browser. It is safe server-side — it can only ingest
// events, never read anything. POSTHOG_API_KEY (a Personal API key, phx_...) is
// a DIFFERENT key that powers the admin panel's PostHog queries; do not swap them.
// A disabled or unreachable analytics backend must NEVER affect billing, trading
// or auth: every call is guarded, bounded and non-throwing by contract.

export async function captureServer(
  event: string,
  distinctId: string,
  props: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  try {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || !distinctId) return;
    const { PostHog } = await import("posthog-node");
    const client = new PostHog(key, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: 3000,
    });
    client.capture({ event, distinctId, properties: props });
    // flush now and drop the instance: serverless-safe, no background timers
    await client.shutdown().catch(() => undefined);
  } catch {
    /* analytics must never break the request path */
  }
}
