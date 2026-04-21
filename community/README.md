# Crosshair F - Community Backend Setup

The community feature lets users browse and share crosshairs from inside the app. We use **Supabase** as the backend because it has a generous free tier (500MB DB, 50k monthly users, no credit card required).

## Quick start (15 minutes)

### 1. Make a Supabase account
- Go to https://supabase.com and sign up (uses your Google or GitHub account)
- Click "New Project"
- Pick a name like `crosshair-f-community`
- Set a strong database password (save it, you may need it)
- Pick a region close to your users (Singapore or Mumbai for Asia, Frankfurt for Europe, US-East for Americas)
- Wait 2-3 minutes for project to be ready

### 2. Run the SQL setup
- In your Supabase project, go to **SQL Editor** (left sidebar)
- Click **New query**
- Copy the entire contents of `setup.sql` (in this same folder) and paste it
- Click **Run**
- You should see "Success. No rows returned"

### 3. Get your API credentials
- Go to **Settings → API** in left sidebar
- Copy the **Project URL** (looks like `https://abcdefg.supabase.co`)
- Copy the **anon public** key (long JWT string starting with `eyJhbG...`)

### 4. Connect the app
- Open Crosshair F → Community tab
- Paste the Project URL and anon key
- Click **Save & Connect**

That's it. Users can now browse and upload crosshairs.

## How safety works

**Why presets are safe:** Crosshair presets are pure JSON describing a shape (size, color, etc). There is no executable code. A malicious user cannot ship malware through a JSON preset.

**Validation layers:**
1. **Client-side** (`main.js` → `sanitizePreset`) strips unknown fields, validates colors match `#RRGGBB`, checks numeric ranges
2. **Database constraints** (`setup.sql`) enforce length limits and shape whitelist
3. **Auto-verify cron** runs every minute, marks safe presets as `verified = TRUE`. Only verified presets show up to other users.
4. **Report system** auto-unverifies anything with 5+ reports
5. **Custom images blocked from upload** (the app refuses to upload preset.shape === 'custom')

**Optional: VirusTotal scanning for any future custom-image feature**
If you later add image upload support, get a free VirusTotal API key (https://www.virustotal.com/gui/my-apikey) and call their API server-side from a Supabase Edge Function before marking the row verified.

## Optional: enable auto-verify cron

By default, presets stay `verified = FALSE` and never appear publicly. To auto-verify safe ones:

1. Supabase dashboard → **Database → Extensions**
2. Search for `pg_cron`, click **Enable**
3. Run this in SQL Editor:
   ```sql
   SELECT cron.schedule('auto-verify-presets', '* * * * *', 'SELECT auto_verify_safe_presets();');
   ```

Now safe presets get marked verified within 30-60 seconds.

## Optional: manual moderation

Before the cron is enabled, only you can mark crosshairs as verified. Use the SQL Editor:
```sql
-- See pending uploads
SELECT id, name, author, game, created_at FROM crosshairs WHERE verified = FALSE ORDER BY created_at DESC;

-- Verify one
UPDATE crosshairs SET verified = TRUE WHERE id = 'paste-uuid-here';

-- Delete spam
DELETE FROM crosshairs WHERE id = 'paste-uuid-here';
```

## Free tier limits

Supabase free tier handles roughly:
- 500MB database (each crosshair preset is ~500 bytes, so about 1 million presets fit)
- 50,000 monthly active users
- 5GB bandwidth/month
- Unlimited API requests

When you cross 50k MAU, upgrade to Pro ($25/month) or self-host Postgres on a $5 VPS.

## Spam prevention extras (recommended)

Add rate limiting via a Supabase Edge Function. Example (deploy with `supabase functions deploy upload`):

```js
// supabase/functions/upload/index.ts
import { serve } from "https://deno.land/std/http/server.ts";

const RATE_LIMIT = new Map();

serve(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const last = RATE_LIMIT.get(ip) || 0;
  if (now - last < 30000) {
    return new Response(JSON.stringify({ error: 'Wait 30 seconds between uploads' }), { status: 429 });
  }
  RATE_LIMIT.set(ip, now);
  // forward to actual insert
  const body = await req.json();
  // insert logic here...
  return new Response(JSON.stringify({ ok: true }));
});
```

## Cost summary

| Users | Cost |
|-------|------|
| 0 - 50,000 / month | $0 |
| 50,000 - 500,000 / month | $25/month (Supabase Pro) |
| 500,000+ | Self-host or Pro plus add-ons |

For a launching gaming utility, you will be in the free tier for a long time.
