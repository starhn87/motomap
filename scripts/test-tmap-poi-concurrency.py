# 운영 연결 없이 만료 격자 두 개의 동시 갱신과 정리 잠금 회귀를 검사한다.
import tempfile,subprocess,os,time,concurrent.futures,shutil
p=os.environ.get('MOTOMAP_PG_BIN','/opt/homebrew/opt/postgresql@17/bin').rstrip('/')+'/'
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
w=tempfile.mkdtemp(prefix='motomap-review-lock-')
def run(args,check=True):
 return subprocess.run(args,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=check)
def sql(s):return run([p+'psql','-X','-h',w,'-p','54392','-d','postgres','-v','ON_ERROR_STOP=1','-c',s],False)
try:
 run([p+'initdb','-D',w+'/data','-A','trust','--no-locale'])
 run([p+'pg_ctl','-D',w+'/data','-l',w+'/server.log','-o','-k '+w+" -p 54392 -c listen_addresses=''",'start'])
 for f in ['tests/sql/tmap-poi-fixture.sql','supabase/migrations/20261011142734_add_location_privacy_controls.sql','supabase/migrations/20261011150411_add_location_history_setting.sql','supabase/migrations/20261028142801_add_tmap_guide_pois.sql','tests/sql/tmap-poi-assertions.sql']:
  run([p+'psql','-X','-h',w,'-p','54392','-d','postgres','-v','ON_ERROR_STOP=1','-f',f])
 sql("truncate public.tmap_poi_cache,public.tmap_poi_daily_budget; insert into public.tmap_poi_cache(cell_lat,cell_lon,expires_at) values(1875,6350,now()-interval '1 hour'),(1876,6350,now()-interval '1 hour');")
 with concurrent.futures.ThreadPoolExecutor() as pool:
  b=pool.submit(sql,"begin; select 1 from public.tmap_poi_cache where cell_lat=1876 and cell_lon=6350 for update; select pg_sleep(1); select public.claim_tmap_poi_refresh(1876,6350); commit;")
  # 두 번째 세션이 잠금을 얻은 뒤 첫 번째 세션을 시작한다.
  deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   locked=sql("select count(*) from pg_stat_activity where query like 'begin; select 1 from public.tmap_poi_cache%' and wait_event='PgSleep';")
   if '1' in locked.stdout:break
   time.sleep(.02)
  else:raise AssertionError('second session did not acquire its cell lock')
  a=pool.submit(sql,"select public.claim_tmap_poi_refresh(1875,6350);")
  for label,f in [('A',a),('B',b)]:
   r=f.result();assert r.returncode==0,(label,r.stderr);assert 'claimed' in r.stdout,(label,r.stdout);print(label,'claimed PASS')
  print('TMAP_CONCURRENCY_AND_SQL_ASSERTIONS_PASS')
finally:
 run([p+'pg_ctl','-D',w+'/data','-m','immediate','stop'],False)
 shutil.rmtree(w)
