create policy "Delete unreferenced own place submission photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'ridemap-media'
  and owner_id = (select auth.uid())::text
  and split_part(name, '/', 1) = 'place-submissions'
  and not exists (
    select 1
    from public.places p
    cross join lateral unnest(p.photos) as photo(url)
    where p.submitted_by = (select auth.uid())
      and right(photo.url, length(storage.objects.name) + 1) = '/' || storage.objects.name
  )
);

-- 공개 객체 경로에 사용자 식별자를 직접 노출하지 않는다.
create policy "Own folder for place submission uploads"
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'ridemap-media'
  or split_part(name, '/', 1) <> 'place-submissions'
  or (
    split_part(name, '/', 2) = encode(sha256(convert_to((select auth.uid())::text, 'UTF8')), 'hex')
    and name ~ '^place-submissions/[0-9a-f]{64}/[0-9a-f-]{36}\.[a-zA-Z0-9]{1,8}$'
  )
);

create function public.validate_place_submission_photos()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  url text;
  path text;
  prefix constant text := 'https://rpbifswrkjcjojaulvor.supabase.co/storage/v1/object/public/ridemap-media/';
begin
  if current_user <> 'authenticated' then return new; end if;
  if cardinality(new.photos) > 5 then
    raise exception 'Too many submission photos' using errcode = '22023';
  end if;
  foreach url in array coalesce(new.photos, array[]::text[]) loop
    path := substr(url, length(prefix) + 1);
    if url is null or not starts_with(url, prefix)
       or path !~ '^place-submissions/[0-9a-f]{64}/[0-9a-f-]{36}\.[a-zA-Z0-9]{1,8}$'
       or not exists (
         select 1 from storage.objects o where o.bucket_id = 'ridemap-media'
           and o.name = path and o.owner_id = (select auth.uid())::text
       ) then
      raise exception 'Invalid submission photo' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.validate_place_submission_photos() from public, anon, authenticated;
create trigger validate_place_submission_photos
before insert or update of photos on public.places
for each row execute function public.validate_place_submission_photos();
