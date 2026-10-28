do $$begin
 if has_function_privilege('anon','public.guide_map_favorites(uuid,integer)','execute') then raise exception 'anon favorite execute allowed';end if;
 if not has_function_privilege('authenticated','public.guide_map_favorites(uuid,integer)','execute') then raise exception 'authenticated favorite execute denied';end if;
 if exists(select 1 from pg_proc where proname in ('guide_map_favorites','guide_places_in_viewport') and prosecdef) then raise exception 'unexpected security definer';end if;
end$$;
set role anon;
do $$begin
 if (select count(*) from public.guide_places_in_viewport(37.49,126.99,37.51,127.01))<>2 then raise exception 'public eligibility/bounds failed';end if;
 if (select id from public.guide_places_in_viewport(37.49,126.99,37.51,127.01,null,1))<>'00000000-0000-0000-0000-000000000001'::uuid then raise exception 'first page wrong';end if;
 if (select id from public.guide_places_in_viewport(37.49,126.99,37.51,127.01,'00000000-0000-0000-0000-000000000001',1))<>'00000000-0000-0000-0000-000000000005'::uuid then raise exception 'cursor page wrong';end if;
 begin perform public.guide_places_in_viewport(38,128,37,127);raise exception 'invalid bounds accepted';exception when invalid_parameter_value then null;end;
 begin perform public.guide_places_in_viewport(37.49,126.99,37.51,127.01,null,252);raise exception 'uncapped page accepted';exception when invalid_parameter_value then null;end;
 begin perform public.guide_map_favorites();raise exception 'anon favorite succeeded';exception when insufficient_privilege then null;end;
end$$;
reset role;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
do $$begin
 if (select count(*) from public.guide_map_favorites())<>2 then raise exception 'own favorites or deleted eligibility failed';end if;
 if exists(select 1 from public.guide_map_favorites() where id='10000000-0000-0000-0000-000000000003') then raise exception 'other actor leaked';end if;
 if (select latitude from public.guide_map_favorites() where id='10000000-0000-0000-0000-000000000002')<>37.5 then raise exception 'legacy general favorite failed';end if;
end$$;
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$begin
 if (select count(*) from public.guide_map_favorites())<>1 then raise exception 'second actor isolation failed';end if;
end$$;
set request.jwt.claim.sub='';
do $$begin
 begin perform public.guide_map_favorites();raise exception 'missing actor accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'GUIDE_POI_SQL_PASS' as result;
