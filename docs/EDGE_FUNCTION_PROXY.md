# Optional: Supabase Edge Function proxy for "Scan Now"

The mobile app can talk to the Node scanner directly. If you prefer a single public host
(Supabase only) and want to keep the scanner private, deploy this ~30-line Edge Function and point
`EXPO_PUBLIC_API_URL` at your Supabase functions URL.

`supabase/functions/scan-now/index.ts`:

```ts
// Deno runtime. Deploy with: supabase functions deploy scan-now --no-verify-jwt=false
const SCANNER_URL = Deno.env.get('SCANNER_URL')!;          // private Node service
const ADMIN_TOKEN = Deno.env.get('SCANNER_ADMIN_TOKEN')!;  // never leaves the server

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // Supabase verifies the user JWT before invoking the function (verify_jwt = true).
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const body = await req.text();
  const upstream = await fetch(`${SCANNER_URL}/v1/scans`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': ADMIN_TOKEN,
      'x-forwarded-authorization': auth,
    },
    body,
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
});
```

Secrets: `supabase secrets set SCANNER_URL=... SCANNER_ADMIN_TOKEN=...`

## Scheduling without a long-lived Node process

If you must schedule from Supabase instead of the in-process cron, enable `pg_cron` + `pg_net` and
call the scanner:

```sql
select cron.schedule(
  'ogii-scan-every-6h',
  '0 */6 * * *',
  $$
    select net.http_post(
      url     := current_setting('app.scanner_url') || '/v1/scans',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-admin-token', current_setting('app.scanner_admin_token')
      ),
      body    := '{"trigger":"scheduled"}'::jsonb
    );
  $$
);
```

Set `SCAN_SCHEDULE=off` in the backend so the two schedulers do not overlap.
