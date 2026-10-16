-- LifeQuest: cache bucket for ElevenLabs voice lines (Edge Function `tts`).
-- Public read so the browser can stream the mp3 by URL; only the Edge Function
-- (service role) uploads. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts-cache', 'tts-cache', true, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;

-- Public buckets already serve files by public URL. This policy also lets
-- anon/authenticated clients read objects through the Storage API.
-- There are deliberately NO insert/update/delete policies: the service role
-- bypasses RLS, everyone else cannot write.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'tts-cache public read'
  ) then
    create policy "tts-cache public read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'tts-cache');
  end if;
end
$$;
