# `tts` Edge Function (realistic voices)

Turns a dialogue line into speech with ElevenLabs and caches the mp3 in the public
Storage bucket `tts-cache`. The ElevenLabs API key lives only in this function's
secrets; the game (a public static site) never sees it.

## API

`POST /functions/v1/tts` (needs `Authorization: Bearer <anon key or user session JWT>`)

```json
{ "text": "We are late!", "voiceId": "XrExE9yKIg1WjnnlVkGX", "emotion": "worried", "speed": 1, "accent": "indian" }
```

- `text`: up to 400 characters after trimming.
- `voiceId`: `^[A-Za-z0-9]{10,40}$`.
- `emotion`: `neutral | cheerful | warm | excited | worried | sad | angry | apologetic | surprised | tired | proud | calm | whisper`.
- `speed` (optional): 0.8–1.15, rounded to 0.05.
- `accent` (optional): `none | indian | nigerian | japanese | brazilian | mexican | irish`.
- `modelHint` (optional): `expressive` (default) or `stable` (always use the fallback model).

Response: `200 { "url": "https://<ref>.supabase.co/storage/v1/object/public/tts-cache/<sha256>.mp3", "cached": true, "model": "eleven_v3" }`.
If Storage is unavailable the function returns the mp3 bytes directly (`audio/mpeg`).
Errors are `{ "error": "...", "code": "..." }`. The codes are `bad_request`, `rate_limited`,
`daily_cap`, `not_configured`, `bad_key`, `voice_unavailable`, `quota`, `busy`, `timeout`,
`upstream` and `internal`.

`GET /functions/v1/tts?health=1` returns `{ ok, configured, storage, model, fallbackModel, dailyCharCap, dailyCharsLeft }`.

## How it works

1. The function validates the request with `validateTtsRequest` in `../_shared/ttsShared.ts`.
   The browser client uses the same file through `src/core/ttsShared.ts`.
2. It builds a cache key: `sha256(model, voiceId, emotion, speed, accent, normalised text)`.
   If `tts-cache/<key>.mp3` already exists, it returns that object's public URL and makes no
   ElevenLabs call.
3. Otherwise it calls `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_64`
   with the `xi-api-key` header.
   - `eleven_v3` (the default, set with `ELEVENLABS_MODEL`): the emotion becomes an inline audio
     tag such as `[worried]`, `[whispers]` or `[sighs] [tired]`. An optional accent tag is added,
     for example `[Indian English accent]`.
   - `eleven_multilingual_v2` (the fallback): the emotion is mapped to `voice_settings`. Intense
     emotions get lower stability and higher style.
   - If the expressive model refuses the request because of plan or model access, the function
     retries with the fallback model and skips the expressive model for 10 minutes.
4. It uploads the mp3 with the service-role key, then returns the public URL.

## Limits (best effort, per function instance, in memory)

- 60 POST requests per minute per IP.
- `TTS_DAILY_CHAR_CAP` characters synthesised per UTC day. The default is 50,000. Cache hits
  don't count toward it.
- Keep the default `verify_jwt = true`, so only callers with a valid Supabase JWT get through.

## Secrets

| Name | Required | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Set it yourself with `npx supabase secrets set`. Never commit it. |
| `ELEVENLABS_MODEL` | no | Default `eleven_v3`. You can also use `eleven_v4`, which also supports audio tags, or `eleven_multilingual_v2`. |
| `TTS_DAILY_CHAR_CAP` | no | Default `50000`. |
| `TTS_VOICE_REMAP` | no | JSON object `{"<id the game asks for>": "<id to use>"}`. It recasts voices for every player without rebuilding the site. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are built in.

## Deploy

See **docs/SUPABASE_SETUP.md → Realistic voices (ElevenLabs)**. The short version:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                       # or run supabase/migrations/0002_tts_cache.sql in the SQL editor
npx supabase secrets set ELEVENLABS_API_KEY=<paste your key>
npx supabase functions deploy tts
```

If the CLI complains that `supabase/config.toml` is missing, run `npx supabase init`
once. Answer "no" to the optional prompts, then repeat the command.
