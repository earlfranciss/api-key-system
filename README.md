# API Key System (Supabase Edge Functions)

A minimal, secure API key system built on Supabase — the same pattern used by
Stripe, OpenAI, and most developer-facing APIs. Customers generate a key,
you never store the raw key, and a gatekeeper Edge Function validates every
request.

This repo documents the exact process used to build and test it, including
the setup steps, the code, and the issues hit along the way (Windows/PowerShell
curl quirks included).

---

## How it works

```
Customer clicks "Generate Key"
        │
        ▼
Postgres function creates a random key,
hashes it (SHA-256), stores ONLY the hash,
returns the raw key ONCE
        │
        ▼
Customer copies the raw key and saves it themselves
(we never see it again)
        │
        ▼
Customer sends the key in every request
via the `x-api-key` header
        │
        ▼
Edge Function ("check-key") hashes the incoming key,
looks up the hash in the database
        │
        ├─ Match found   → 200 OK, return data
        └─ No match      → 401 Unauthorized
```

The core rule: **the raw key is never stored anywhere except the customer's
own clipboard.** If the database ever leaks, only hashes leak — which are
useless to an attacker (SHA-256 can't be reversed back into the original key).

---

## Repo structure

```
api-key-system/
├── README.md
└── supabase/
    ├── 01_api_keys_table.sql              # table + row level security
    ├── 02_generate_api_key_function.sql   # key generator (Postgres function)
    └── functions/
        └── check-key/
            └── index.ts                    # gatekeeper (Edge Function)
```

---

## Step-by-step process

### 1. Create a Supabase project
- Sign up at [supabase.com](https://supabase.com), create a new project
- Note your project URL and project ref (visible in the dashboard URL and
  Project Settings)

### 2. Create the `api_keys` table
Open the **SQL Editor** in the Supabase dashboard, paste and run
[`01_api_keys_table.sql`](./supabase/01_api_keys_table.sql).

This creates a table that stores:
- `key_hash` — the SHA-256 hash of the key (never the raw key)
- `key_prefix` — first few characters of the key, safe to display in a UI
  (e.g. so a user can tell their keys apart without seeing the full value)
- Row Level Security policies so a user can only see/delete their **own**
  keys, never anyone else's

### 3. Create the key generator function
Paste and run [`02_generate_api_key_function.sql`](./supabase/02_generate_api_key_function.sql)
in the SQL Editor.

This Postgres function:
1. Generates a random key (`sk_live_...`)
2. Hashes it with SHA-256
3. Inserts the hash (not the raw key) into `api_keys`
4. Returns the raw key **as its output** — this is the only place the raw
   key ever exists outside the customer's own storage

**Generate a test key** by running:
```sql
select generate_api_key('my test key');
```
Copy the returned value immediately — it will never be shown again.

### 4. Create the gatekeeper Edge Function
1. In the dashboard: **Edge Functions → Deploy a new function → Via Editor**
2. Name it `check-key`
3. Paste in the contents of [`functions/check-key/index.ts`](./supabase/functions/check-key/index.ts)
4. **Go to the function's settings and turn "Verify JWT" OFF.**
   This function does its own custom auth check (the `x-api-key` header) —
   if "Verify JWT" is left on, Supabase rejects requests before your code
   even runs, using its own unrelated auth check.
5. Deploy

If using the CLI instead of the dashboard editor:
```bash
supabase functions new check-key
# paste the code into supabase/functions/check-key/index.ts
supabase functions deploy check-key --no-verify-jwt
```

### 5. Test it

**Without a key — should return 401:**
```bash
curl.exe -i https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-key
```

**With a fake key — should also return 401:**
```bash
curl.exe -i https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-key ^
  -H "x-api-key: sk_live_totally_made_up_1234"
```

**With the real key from Step 3 — should return 200:**
```bash
curl.exe -i https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-key ^
  -H "x-api-key: sk_live_your_real_key_here"
```

Expected result once everything is wired correctly:
```
HTTP/1.1 200 OK
...
{"message":"Your API key is valid!"}
```

---

## Troubleshooting notes (from the actual build)

**`curl : Cannot find drive. A drive with the name 'https' does not exist.`**
On Windows, PowerShell's built-in `curl` is actually an alias for
`Invoke-WebRequest`, which uses different syntax and doesn't understand
`\` for line continuation or the `-H` flag the way real curl does.

Fix: force real curl explicitly, and keep the command on **one line**:
```powershell
curl.exe -i https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-key -H "x-api-key: YOUR_KEY"
```
(PowerShell's line-continuation character is a backtick `` ` ``, not `\`.)

**Getting 401 even with a real key**
Check for typos in the header name — it must be exactly `x-api-key` to match
`req.headers.get('x-api-key')` in the function code. A single stray character
(e.g. `cx-api-key`) will silently fail to match.

**Getting a `null` response body with a 200 status**
This means auth succeeded but the data query afterward returned nothing —
usually because the function is querying a placeholder table name that
doesn't exist yet (e.g. `your_data_table`). Point the query at a real table,
or use the placeholder success message shown in `index.ts` while testing the
auth logic in isolation.

**Getting a 500 error**
Check **Edge Functions → your function → Logs** in the dashboard — this
shows runtime errors and any `console.log` output from inside the function.

---

## Security principles this project demonstrates

- **Never store secrets you don't have to** — only the hash is stored, the
  same principle behind never storing raw passwords
- **One-way hashing** — SHA-256 cannot be reversed, so a database leak alone
  doesn't expose usable keys
- **Row Level Security** — authorization enforced at the database layer, not
  just in application code
- **Service role key isolation** — the powerful service role key exists only
  server-side inside the Edge Function, never in client/browser code
- **Instant revocation** — deleting a key row means the very next request
  using that key fails, with no extra code required

---

## Next steps

- [ ] Add rate limiting per API key (e.g. reject after N requests/minute)
- [ ] Wire the gatekeeper to a real data table instead of a placeholder message
- [ ] Build a front-end dashboard: name a key → copy-once modal → list/delete keys
- [ ] Add per-user request limits, not just per-key (a user can otherwise
      bypass a per-key limit by generating a new key)