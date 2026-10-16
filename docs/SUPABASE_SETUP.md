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
