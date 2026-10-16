# Supabase setup (optional cloud saves)

LifeQuest runs fully offline. Saves go to `localStorage`. Supabase adds a cloud
copy per family. If anything below is missing, the game stays in local mode
or shows an error in the HUD, and your progress is still kept locally.

## 1. Create a project

1. Go to https://supabase.com/dashboard and create a new project. Note the database password.
2. Wait for the project to finish provisioning.

## 2. Enable anonymous sign-ins

The game signs players in anonymously, so nobody needs an account.

1. Open **Authentication → Sign In / Providers** (called **Providers** in older dashboards).
2. Turn on **Allow anonymous sign-ins** and save.
3. For a public deployment, also turn on CAPTCHA (Authentication → Attack Protection). The default limit is 30 anonymous sign-ins per hour per IP.

## 3. Run the migration

Use **one** of these options.

- **SQL editor:** open **SQL Editor → New query**, paste the full contents of
  `supabase/migrations/0001_lifequest_init.sql`, and click **Run**. The script
  can safely be run again.
- **Supabase CLI:**
  ```bash
  npx supabase login
  npx supabase link --project-ref <your-project-ref>
  npx supabase db push
  ```

This creates the tables, row-level security policies, helper functions, and
the trigger that creates a `profiles` row for each new user.

## 4. Seed the mission templates

Run `supabase/seed.sql` in the SQL editor, the same way as the migration.
It inserts or updates the 4 missions: `grocery-run`, `clean-room`,
`help-sibling` and `clinic-visit`. Without the seed, cloud saves still work,
but the `assigned_missions` table stays empty. The assignments are still
included in the full save snapshot.

With the CLI and a local stack, `npx supabase db reset` applies the migration
and `supabase/seed.sql` together.

## 5. Configure the app

1. Copy `.env.example` to `.env` in the project root.
2. In the dashboard, open **Project Settings → API** (or **Data API / API Keys**) and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable** key → `VITE_SUPABASE_ANON_KEY`
   ```env
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```
3. **Never** use the `service_role` / secret key. Everything prefixed `VITE_`
   is bundled into the browser. The client refuses keys that look like
   service-role or secret keys and stays in local mode.
4. Restart the dev server (`npm run dev`). Vite only reads `.env` at startup.

## 6. Verify

1. Start or continue a game and trigger a save.
2. The HUD save indicator should read **"Cloud saved"**. "Saved locally" means
   Supabase isn't configured, so check `.env` and restart.
3. In the dashboard, check the following:
   - **Authentication → Users** has a new anonymous user.
   - **Table Editor → `families`** has a row for your family.
   - **`game_saves`** has a row whose `save` holds the full game state.
   - **`family_members`**, **`player_stats`** and **`player_inventory`** are filled.
   - **`assigned_missions`** has rows once a guardian assigns a mission.

## Troubleshooting

All cloud errors show in the HUD as *"Cloud save failed: … Progress kept
locally."* The game never reports a cloud save that didn't happen.

| HUD message contains | Cause | Fix |
| --- | --- | --- |
| `Anonymous sign-ins are disabled` | Step 2 skipped | Enable anonymous sign-ins, then save again |
| `blocked by row-level security` | Migration not run, partly run, or policies changed | Re-run `0001_lifequest_init.sql` and check that you are on the right project |
| `database tables missing` | Migration not run | Run step 3 |
| `could not reach Supabase` / `did not respond in time` | Offline, or wrong `VITE_SUPABASE_URL` | Check the URL and your network. Progress is kept locally and syncs on the next save |
| `rejected the anon key` | Wrong or rotated key | Copy the anon/publishable key again and restart the dev server |
| Always "Saved locally" | Env vars missing, or a service-role key was used | Fix `.env` and restart the dev server |

Other notes:

- **Family id cache:** the browser stores your family id under
  `localStorage['lifequest.familyId']`. Clearing the save (`repository.clear()`) removes it. If the
  anonymous session is lost (site data cleared), the next save creates a new
  family under the new anonymous user. The old one stays in the database,
  owned by the old user.
- **Local wins after a failed sync:** if the last cloud sync failed, *Continue*
  loads the local save, which is newer, instead of the older cloud copy.
- **Trust model:** XP, skills, money and mission scores are computed in the
  browser and stored as sent. They are not authoritative. Don't attach real
  rewards to them without moving scoring to the server.

## Realistic voices (ElevenLabs)

Optional. The game normally speaks with the browser's built-in voices. With this
set up, characters use ElevenLabs voices that show emotion and suit the region.
The ElevenLabs API key stays in a Supabase Edge Function (`supabase/functions/tts`)
and never reaches the browser. The game calls the function with the public anon
key, or with the anonymous player's session.

You need steps 1–5 above (a project, anonymous sign-ins, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in `.env`). For GitHub Pages, set those two as repository
secrets as well.

### 1. Create an ElevenLabs API key (you do this yourself)

1. Sign in at https://elevenlabs.io and open the **API Keys** page (in the developer or account settings area).
2. Create a key. If you can restrict its permissions, allow only **Text to Speech**.
   You can also set a monthly credit limit on the key.
3. Keep the key private. Don't paste it into `.env`, the code, chat, or a commit.
   It only goes into the Supabase secret in step 3.

### 2. Create the cache bucket

Use one of these options:

- **SQL editor:** paste and run `supabase/migrations/0002_tts_cache.sql`.
- **CLI** (from the project root):
  ```bash
  npx supabase login
  npx supabase link --project-ref <your-project-ref>
  npx supabase db push
  ```

This creates the public `tts-cache` bucket. Anyone can read the mp3 files by URL.
Only the Edge Function, using the service role, can upload.

### 3. Store the key as a function secret

Type this command yourself and paste your own key in place of the placeholder:

```bash
npx supabase secrets set ELEVENLABS_API_KEY=<your-elevenlabs-key>
```

These secrets are optional:

```bash
npx supabase secrets set TTS_DAILY_CHAR_CAP=50000          # characters synthesised per day (default 50000)
npx supabase secrets set ELEVENLABS_MODEL=eleven_v3        # default; eleven_v4 or eleven_multilingual_v2 also work
```

### 4. Deploy the function

```bash
npx supabase functions deploy tts
```

Keep JWT verification on, which is the default. Don't pass `--no-verify-jwt`.
If the CLI says `config.toml` is missing, run `npx supabase init` once, then deploy again.

### 5. Verify

1. **Health check.** Replace `<ref>` with your project ref and `<anon-key>` with the
   legacy anon JWT key:
   ```bash
   curl -H "Authorization: Bearer <anon-key>" "https://<ref>.supabase.co/functions/v1/tts?health=1"
   ```
   The response should be `{"ok":true,"configured":true,"storage":true,"model":"eleven_v3",...}`.
   If you only have a publishable key (`sb_publishable_…`), skip this step and use the
   in-game check below. That key isn't a JWT, so the game signs in anonymously first.
2. **In the game.** Open **Settings → Voices**:
   - **Realistic AI voices (ElevenLabs)** should show **Available**, followed by
     "Voice service ready (eleven_v3)".
   - Choose **Realistic**, then press **Test emotions**. A family member says the same
     line three times: cheerful, worried, then cross.
   - If a line fails, the game falls back to browser speech, then to babble. The
     status line shows the reason.
3. **In the dashboard.** Open **Storage → tts-cache**. It fills with `<hash>.mp3` files as
   you play.

New players get **Realistic** voices by default when the site has Supabase configured.
Players can switch back to browser **Voices**, **Babble** or **Off** at any time.

### Costs, caching and limits

- ElevenLabs bills per character synthesised. Each distinct line, voice and emotion
  is generated once, then served from Storage. Replays and other players hearing the
  same line cost no credits. Most dialogue has no player-specific text, so the cache
  warms up quickly.
- `TTS_DAILY_CHAR_CAP` limits new synthesis per day. When it runs out, the game uses
  built-in voices until the next UTC day. This cap and the 60-requests-per-minute-per-IP
  limit are kept in memory per function instance, so they are best effort. For a hard
  limit, also set a credit limit on the ElevenLabs key.
- Emptying the `tts-cache` bucket is safe. The files are regenerated on demand.

### Voices and accents

- The game casts ElevenLabs **default** voices (see `src/core/voiceCast.ts`):
  - British voices for the UK and EU regions.
  - American voices for the US and the other regions.
  - The youngest-sounding voices for children and older-sounding ones for grandparents.
  - Different voices for characters of the same kind.
- For India, Nigeria, Japan, Brazil and Mexico, the expressive model also gets an accent
  hint, such as `[Indian English accent]`. You can turn this off under
  **Settings → Advanced → Regional accent hints**.
- **Important:** ElevenLabs only offers default voices to accounts created before
  March 2026, and they stop working on **31 Dec 2026**. If you see "This voice is not
  available on the ElevenLabs account":
  - **For every player:** add voices to your ElevenLabs account. You can pick
    region-native voices from the Voice Library (using it through the API needs a paid
    plan), or make them with Voice Design. Then map the game's default IDs to your own:
    ```bash
    npx supabase secrets set TTS_VOICE_REMAP='{"XrExE9yKIg1WjnnlVkGX":"<your-voice-id>","cjVigY5qzO86Huf0OWal":"<another-id>"}'
    ```
    `src/core/voiceCast.ts` lists the default IDs with their names.
  - **For one device:** open **Settings → Voices → Advanced: custom voice IDs** and
    paste a voice ID for each character.

### Troubleshooting realistic voices

| Settings status says | Fix |
| --- | --- |
| Not configured | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing from this build |
| The "tts" Edge Function is not deployed | Run step 4 against the same project as `VITE_SUPABASE_URL` |
| ELEVENLABS_API_KEY secret is missing / rejected the API key | Repeat step 3 with a valid key. The function picks up new secrets automatically |
| rejected the app key | Enable anonymous sign-ins (step 2 of the main setup), or use the legacy anon JWT key |
| plan or quota | Your ElevenLabs plan doesn't allow the model or voice, or your credits are used up |
| Daily voice budget used up | Raise `TTS_DAILY_CHAR_CAP` or wait until tomorrow (UTC) |
| Click or press a key once to allow sound | The browser blocked autoplay. Any click or key press unlocks audio |
