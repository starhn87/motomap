set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$declare v jsonb; begin
  v:=public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao"]}');
  if v->'providers' @> '["tmap"]' then raise exception 'tmap silently granted'; end if;
  begin
    perform public.location_privacy('record',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","id":"22222222-1111-1111-1111-111111111111","purpose":"search","recipient":"tmap"}');
    raise exception 'missing tmap consent accepted';
  exception when others then if sqlerrm='missing tmap consent accepted' then raise; end if; end;
  v:=public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"],"version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao","tmap"]}');
  if not v->'providers' @> '["tmap"]' then raise exception 'explicit tmap lost'; end if;
  perform public.location_privacy('record',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","id":"22222222-1111-1111-1111-111111111111","purpose":"search","recipient":"tmap"}');
  v:=public.location_privacy('events',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111"}');
  if jsonb_array_length(v->'events')<>0 then raise exception 'legacy sees unknown recipient'; end if;
  v:=public.location_privacy('events',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"]}');
  if jsonb_array_length(v->'events')<>1 then raise exception 'new client cannot read tmap usage'; end if;
  v:=public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao"]}');
  if v->'providers' @> '["tmap"]' then raise exception 'legacy response includes unknown provider'; end if;
  v:=public.location_privacy('status',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"]}');
  if not v->'providers' @> '["tmap"]' then raise exception 'legacy reconsent erased tmap'; end if;
  v:=public.set_location_history_enabled(true,'11111111-1111-1111-1111-111111111111');
  if v->'providers' @> '["tmap"]' or v->>'historyAllowed'<>'true' then raise exception 'legacy history setter broken'; end if;
  perform public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"],"version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao"]}');
  v:=public.location_privacy('events',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"]}');
  if jsonb_array_length(v->'events')<>0 then raise exception 'revoked tmap usage retained'; end if;
  perform public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"],"version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao","tmap"]}');
  perform public.location_privacy('withdraw',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111"}');
  perform public.location_privacy('consent',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","version":"2026-10-11-location-v2","ageConfirmed":true,"locationAgreed":true,"providers":["kakao"]}');
  v:=public.location_privacy('status',null,'{"expectedActor":"11111111-1111-1111-1111-111111111111","clientCapabilities":["tmap"]}');
  if v->'providers' @> '["tmap"]' then raise exception 'withdrawn tmap silently reenabled'; end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.claim_tmap_poi_refresh(integer,integer)','EXECUTE') or
 has_function_privilege('authenticated','public.finish_tmap_poi_refresh(integer,integer,uuid,jsonb)','EXECUTE') or
 has_table_privilege('authenticated','public.tmap_poi_cache','SELECT') then raise exception 'public cache privilege'; end if;
end $$;
set role service_role;
do $$declare a jsonb; b jsonb; expiry numeric; begin
 a:=public.claim_tmap_poi_refresh(1875,6350);
 if a->>'state'<>'claimed' then raise exception 'not claimed'; end if;
 b:=public.claim_tmap_poi_refresh(1875,6350);
 if b->>'state'<>'busy' then raise exception 'not single flight'; end if;
 begin
   perform public.finish_tmap_poi_refresh(1875,6350,gen_random_uuid(),jsonb_build_object('pois','[]'::jsonb,'fetchedAt',a->'fetchedAt','expiresAt',(a->>'fetchedAt')::numeric+10000,'partial',false));
   raise exception 'stale writer accepted';
 exception when others then if sqlerrm='stale writer accepted' then raise; end if; end;
 begin
   perform public.finish_tmap_poi_refresh(1875,6350,(a->>'token')::uuid,jsonb_build_object('pois','[]'::jsonb,'fetchedAt',a->'fetchedAt','expiresAt',(a->>'fetchedAt')::numeric+86400000,'partial',false));
   raise exception '24 hour cache accepted';
 exception when others then if sqlerrm='24 hour cache accepted' then raise; end if; end;
 expiry:=(a->>'fetchedAt')::numeric+82800000;
 perform public.finish_tmap_poi_refresh(1875,6350,(a->>'token')::uuid,jsonb_build_object('pois','[]'::jsonb,'fetchedAt',a->'fetchedAt','expiresAt',expiry,'partial',false));
 update public.tmap_poi_daily_budget set calls=15997;
 b:=public.claim_tmap_poi_refresh(1875,6350);
 if b->>'state'<>'hit' or (b->'snapshot'->>'expiresAt')::numeric<>expiry then raise exception 'hit renews expiry or consumes budget'; end if;
 b:=public.claim_tmap_poi_refresh(1876,6350);
 if b->>'state'<>'limited' then raise exception 'global budget exceeded'; end if;
end $$;
reset role;
