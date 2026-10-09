-- RT Performance · Storage buckets
--   brand-assets   : public-read logos / coach photos, path = <org_id>/<file>. Writes: workspace owners only.
--   exercise-media : private, path = <org_id>/<file>. Read: workspace members (signed URLs). Writes: coaches.
-- Guarded so the migration also applies on databases without the Supabase Storage schema (local CI stack).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket configuration';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('brand-assets', 'brand-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
         ('exercise-media', 'exercise-media', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "brand assets owner write" on storage.objects for insert to authenticated
      with check (bucket_id = 'brand-assets'
                  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and private.is_org_owner(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "brand assets owner update" on storage.objects for update to authenticated
      using (bucket_id = 'brand-assets'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and private.is_org_owner(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "brand assets owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'brand-assets'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and private.is_org_owner(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "exercise media member read" on storage.objects for select to authenticated
      using (bucket_id = 'exercise-media'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and private.is_org_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "exercise media coach write" on storage.objects for insert to authenticated
      with check (bucket_id = 'exercise-media'
                  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                  and private.is_coach(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "exercise media coach delete" on storage.objects for delete to authenticated
      using (bucket_id = 'exercise-media'
             and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
             and private.is_coach(((storage.foldername(name))[1])::uuid))
  $p$;
end;
$$;
