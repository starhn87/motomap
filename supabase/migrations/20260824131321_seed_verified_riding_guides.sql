-- 기존 코스의 설명에 이름이 명시되고 현재 활성 장소 ID까지 대조한 콘텐츠만
-- 목적지 중심 라이딩 추천으로 옮긴다. 가까운 좌표를 임의로 연결하지 않는다.
-- 빈 로컬 DB처럼 기존 운영 콘텐츠가 없는 환경에서는 안전하게 아무것도 넣지 않는다.

with candidates (
  id,
  title,
  summary,
  description,
  featured_roads,
  regions,
  tags,
  legacy_course_id,
  legacy_course_name,
  required_place_ids,
  required_place_names
) as (
  values
    (
      'b574db38-fd35-43cb-abee-d142b5acc812'::uuid,
      '강화도 해안과 라이더 카페',
      '강화도의 라이더 카페를 잇고 해안도로까지 즐기는 하루 라이딩.',
      '강화도 동쪽 해안에는 초지진과 광성보 같은 옛 돈대가 이어지고 봄이면 벚꽃길이 펼쳐져요. 교동도의 강만장과 석모도의 블랙바트에서 충분히 쉬어가며 섬의 서로 다른 풍경을 즐겨보세요.',
      array['강화일주도로', '강화도 동쪽 해안도로']::text[],
      array['인천']::text[],
      array['강화도', '해안', '카페 투어', '봄']::text[],
      '641699a6-904e-4b99-9587-96a408c31781'::uuid,
      '강화도 일주 코스',
      array[
        'e183e768-f7d1-4bd2-97b2-92a556e71c31'::uuid,
        '592f0dad-96cc-4e38-9448-e36355e4c802'::uuid
      ],
      array['강만장', '블랙바트']::text[]
    ),
    (
      '15666c2f-a4b9-419f-a05c-0391d95911f0'::uuid,
      '대부도 석양 라이딩',
      '헬로모토에서 쉬었다 서해의 석양을 만나기 좋은 반나절 라이딩.',
      '대부도는 해 질 무렵에 나서야 진가가 보여요. 모터사이클 콘셉트 카페 헬로모토에서 쉬고 대부황금로를 따라 탄도항 방향으로 달리면 서해로 지는 해를 만날 수 있어요.',
      array['대부황금로', '대부도 해안도로']::text[],
      array['경기']::text[],
      array['대부도', '해안', '석양', '반나절']::text[],
      'd3e656a2-bb26-4057-a631-024012e8627c'::uuid,
      '대부도 해안 코스',
      array['718c1606-4cf6-401d-9202-c060f61eb497'::uuid],
      array['헬로모토']::text[]
    ),
    (
      'bd91ca3c-a6e7-46c9-a13f-b8d82c3f3733'::uuid,
      '북한강 따라 쉬어가는 라이딩',
      '두물머리와 북한강변 카페를 이어 강바람과 풍경을 즐겨요.',
      '남양주와 양평의 강변은 급한 코너가 적어 풍경을 보며 편하게 달리기 좋아요. 두물머리에서 물안개를 보고 북한강로의 브리끄에서 쉬어가면 짧게도 길게도 조절할 수 있어요.',
      array['북한강로(45번 국도)', '양수리 강변도로']::text[],
      array['경기']::text[],
      array['북한강', '강변', '전망', '카페 투어']::text[],
      '6e9e4262-bc27-46e2-b87d-b83790953a5e'::uuid,
      '북한강 라이딩 코스',
      array[
        '6a7d8489-ec9e-4c15-b219-aaa08f3711a9'::uuid,
        'd7bd1010-8305-4332-b482-c57f2d7adbab'::uuid
      ],
      array['브리끄', '두물머리']::text[]
    ),
    (
      '3cb872bf-eb65-4e5c-a589-6ad23ad45511'::uuid,
      '미시령과 한계령 사이',
      '설악의 두 고갯길과 정상 풍경을 잇는 경험자용 산악 라이딩.',
      '미시령 옛길에서 속초 방향으로 내려간 뒤 한계령까지 이어지는 설악의 대표 와인딩이에요. 연속 헤어핀과 급경사가 이어지므로 충분히 쉬고, 통제와 결빙 여부를 확인한 날에 달려주세요.',
      array['미시령 옛길', '한계령로']::text[],
      array['강원']::text[],
      array['와인딩', '고갯길', '전망', '가을']::text[],
      '068e0dd1-5914-4ee9-8aa0-0cdf557909ba'::uuid,
      '설악 미시령-한계령 와인딩 코스',
      array[
        '312e2439-5a31-4db8-9a08-77bd757ce139'::uuid,
        '6b927911-6a58-4941-949a-84c94a104da2'::uuid
      ],
      array['한계령휴게소', '미시령 옛길 정상']::text[]
    ),
    (
      '28afcc14-9333-4678-a2bc-08c8786ac175'::uuid,
      '양평 만남의 광장으로',
      '남한강 풍경을 따라 대표적인 라이더 집결지로 가는 입문 라이딩.',
      '팔당에서 남한강을 따라 양평 만남의 광장으로 가는 길은 흐름이 순하고 강 풍경이 계속 이어져 첫 교외 라이딩으로 무난해요. 주말 아침에는 다양한 바이크를 보는 재미도 있어요.',
      array['6번 국도 팔당~양평 구간']::text[],
      array['경기']::text[],
      array['양평', '남한강', '입문', '반나절']::text[],
      'e05764de-824e-4078-a8d3-df75875ec7db'::uuid,
      '양평 6번 국도 코스',
      array['e0a6e80b-55a1-4285-b21c-2e8eead7cfad'::uuid],
      array['양평 만남의 광장']::text[]
    ),
    (
      '372d38b3-6990-4810-b00b-3f8909752dda'::uuid,
      '용인·이천 라이더 카페 투어',
      '이동이 짧은 라이더 카페 세 곳을 쉬엄쉬엄 둘러보는 첫 투어.',
      '롤링트라이브에서 카페194를 거쳐 카페피네스까지 이어보세요. 구간마다 이동이 짧고 쉴 곳이 분명해 초보 라이더의 첫 투어로 좋고, 모임 장소를 정하기도 편해요.',
      array['42번 국도 용인~이천 구간']::text[],
      array['경기']::text[],
      array['용인', '이천', '카페 투어', '초보']::text[],
      '843f8bce-56b2-44fe-8f8c-c88f32922bfc'::uuid,
      '용인-이천 카페 투어',
      array[
        '8e869137-0f77-4bd7-86f8-2daabd0dd42f'::uuid,
        'ca15d3cf-05db-4653-ac0d-0cb1e1866ef4'::uuid,
        '33a09ee3-5705-4775-9673-44192b34bc81'::uuid
      ],
      array['롤링트라이브', '카페194', '카페피네스']::text[]
    ),
    (
      'fc095734-0de0-41b0-a897-7188d498dea0'::uuid,
      '천안 바이커 카페 투어',
      '천안 시내의 바이커 카페 세 곳을 가볍게 이어보는 미니 투어.',
      '안라커피에서 시작해 로맨틱투휠과 할리우드를 둘러보세요. 세 장소가 멀지 않아 평일 저녁이나 짧은 주말 라이딩에도 부담이 적고, 출발 전 쉬며 바이크를 살피기 좋아요.',
      array[]::text[],
      array['충남']::text[],
      array['천안', '카페 투어', '단거리', '반나절']::text[],
      'bed4b81e-62e7-48b9-bd7e-1803aca23b1b'::uuid,
      '천안 바이커 카페 투어',
      array[
        'bd65d521-55fb-4a8a-8e24-cac6025e8406'::uuid,
        '6e04c67b-eebc-4933-ae7c-bdafc8130e75'::uuid,
        '3834ac34-5ec7-4495-a7a4-5b1251d23ee8'::uuid
      ],
      array['안라커피', '로맨틱투휠', '할리우드']::text[]
    ),
    (
      '685871c2-0fe0-46d0-ae2a-ae1a38801967'::uuid,
      '파주에서 양주 카페 투어',
      '파주의 라이더 카페에서 양주의 카페까지 한적한 북부 길로 이어가요.',
      '파주 광탄의 리로드에서 몸을 풀고 양주의 라드까지 이어보세요. 수도권 북부의 비교적 한적한 길을 달릴 수 있고 주말 오전 반나절 일정으로 맞추기 좋아요.',
      array['파주·양주 북부 지방도']::text[],
      array['경기']::text[],
      array['파주', '양주', '카페 투어', '반나절']::text[],
      'cd3f7447-24c5-4c8d-80c2-27d3472185f0'::uuid,
      '파주-양주 북부 코스',
      array[
        'd0f5f689-ceaf-47dc-b1cd-09d715c493a0'::uuid,
        '1569a1a6-d79f-4096-a737-449f3288d66d'::uuid
      ],
      array['리로드', '라드']::text[]
    ),
    (
      '468dd12c-fec2-44b4-a2c3-b0340e7cb396'::uuid,
      '포천·철원 산길 라이딩',
      '포천의 라이더 카페 두 곳을 거점으로 북쪽 산길을 즐겨요.',
      '포천 시내를 벗어나 북쪽으로 가면 교통량이 줄고 산길 코너가 이어져요. 바이크와커피가만나다와 포천아우토반카페에서 충분히 쉬며 페이스를 조절하고 한나절 여유를 두세요.',
      array['43번 국도 포천~철원 구간']::text[],
      array['경기', '강원']::text[],
      array['포천', '철원', '와인딩', '산길']::text[],
      '3f7fce1a-2910-44b3-a660-b1ef19b8435d'::uuid,
      '포천-철원 와인딩 코스',
      array[
        '7fb58804-550e-47ac-85f8-c10539b77d2d'::uuid,
        '81c7be22-2b21-4368-a9bb-50228f90be51'::uuid
      ],
      array['포천아우토반카페', '바이크와커피가만나다']::text[]
    ),
    (
      'f378a885-2b8c-44ef-af81-594af84fd9ac'::uuid,
      '성삼재와 정령치 고갯길',
      '지리산의 두 높은 쉼터를 잇는 급경사 산악 와인딩.',
      '구례에서 성삼재휴게소로 오른 뒤 달궁계곡과 정령치휴게소를 이어보세요. 급경사와 연속 코너가 계속되므로 충분히 쉬어가고 겨울철 결빙과 통제 정보를 확인해야 해요.',
      array['861번 지방도 성삼재로', '정령치로']::text[],
      array['전남', '전북']::text[],
      array['지리산', '와인딩', '고갯길', '전망']::text[],
      '7e28b06e-e1a2-4028-b93e-8121cfe562e4'::uuid,
      '지리산 성삼재-정령치 코스',
      array[
        '1e82e839-204d-401d-9c42-4e3b7a6bbe03'::uuid,
        'af4ae0dc-3381-42e3-b121-03d5aa4a229f'::uuid
      ],
      array['성삼재휴게소', '정령치휴게소']::text[]
    )
)
insert into public.riding_guides (
  id,
  title,
  summary,
  description,
  featured_roads,
  regions,
  tags,
  legacy_course_id,
  published_at
)
select
  candidate.id,
  candidate.title,
  candidate.summary,
  candidate.description,
  candidate.featured_roads,
  candidate.regions,
  candidate.tags,
  candidate.legacy_course_id,
  now()
from candidates candidate
join public.courses legacy
  on legacy.id = candidate.legacy_course_id
  and legacy.name = candidate.legacy_course_name
  and legacy.approved is true
  and legacy.deleted_at is null
where not exists (
  select 1
  from unnest(candidate.required_place_ids, candidate.required_place_names)
    as required(place_id, place_name)
  left join public.places place
    on place.id = required.place_id
    and place.name = required.place_name
    and place.approved is true
    and place.deleted_at is null
  where place.id is null
)
on conflict (id) do nothing;

with mapped_stops (guide_id, position, role, place_id, place_name, note) as (
  values
    ('b574db38-fd35-43cb-abee-d142b5acc812'::uuid, 0, 'primary', 'e183e768-f7d1-4bd2-97b2-92a556e71c31'::uuid, '강만장', '교동도에서 라이더들이 쉬어가기 좋은 카페예요.'),
    ('b574db38-fd35-43cb-abee-d142b5acc812'::uuid, 1, 'stop', '592f0dad-96cc-4e38-9448-e36355e4c802'::uuid, '블랙바트', '석모도까지 이어 달릴 때 함께 들르기 좋아요.'),
    ('15666c2f-a4b9-419f-a05c-0391d95911f0'::uuid, 0, 'primary', '718c1606-4cf6-401d-9202-c060f61eb497'::uuid, '헬로모토', '대부도 라이딩의 출발이나 휴식 거점으로 좋아요.'),
    ('bd91ca3c-a6e7-46c9-a13f-b8d82c3f3733'::uuid, 0, 'primary', '6a7d8489-ec9e-4c15-b219-aaa08f3711a9'::uuid, '브리끄', '북한강로를 달리다 강변에서 쉬어가기 좋아요.'),
    ('bd91ca3c-a6e7-46c9-a13f-b8d82c3f3733'::uuid, 1, 'stop', 'd7bd1010-8305-4332-b482-c57f2d7adbab'::uuid, '두물머리', '이른 시간의 물안개와 남한강·북한강 풍경을 볼 수 있어요.'),
    ('3cb872bf-eb65-4e5c-a589-6ad23ad45511'::uuid, 0, 'primary', '312e2439-5a31-4db8-9a08-77bd757ce139'::uuid, '한계령휴게소', '한계령 정상에서 충분히 쉬며 설악 풍경을 볼 수 있어요.'),
    ('3cb872bf-eb65-4e5c-a589-6ad23ad45511'::uuid, 1, 'stop', '6b927911-6a58-4941-949a-84c94a104da2'::uuid, '미시령 옛길 정상', '미시령 옛길의 고도감과 동해 방향 전망을 함께 즐겨요.'),
    ('28afcc14-9333-4678-a2bc-08c8786ac175'::uuid, 0, 'primary', 'e0a6e80b-55a1-4285-b21c-2e8eead7cfad'::uuid, '양평 만남의 광장', '서울 근교 라이더들이 모이고 쉬어가는 대표 집결지예요.'),
    ('372d38b3-6990-4810-b00b-3f8909752dda'::uuid, 0, 'primary', '8e869137-0f77-4bd7-86f8-2daabd0dd42f'::uuid, '롤링트라이브', '주차장이 넓어 투어의 출발 장소로 정하기 좋아요.'),
    ('372d38b3-6990-4810-b00b-3f8909752dda'::uuid, 1, 'stop', 'ca15d3cf-05db-4653-ac0d-0cb1e1866ef4'::uuid, '카페194', '용인 구간에서 여유 있게 쉬어갈 수 있어요.'),
    ('372d38b3-6990-4810-b00b-3f8909752dda'::uuid, 2, 'stop', '33a09ee3-5705-4775-9673-44192b34bc81'::uuid, '카페피네스', '이천 쪽에서 라이더 문화와 함께 마무리하기 좋아요.'),
    ('fc095734-0de0-41b0-a897-7188d498dea0'::uuid, 0, 'primary', 'bd65d521-55fb-4a8a-8e24-cac6025e8406'::uuid, '안라커피', '출발 전 쉬며 바이크를 살피기 좋은 라이더 카페예요.'),
    ('fc095734-0de0-41b0-a897-7188d498dea0'::uuid, 1, 'stop', '6e04c67b-eebc-4933-ae7c-bdafc8130e75'::uuid, '로맨틱투휠', '천안 시내 미니 투어로 함께 둘러보기 좋아요.'),
    ('fc095734-0de0-41b0-a897-7188d498dea0'::uuid, 2, 'stop', '3834ac34-5ec7-4495-a7a4-5b1251d23ee8'::uuid, '할리우드', '짧은 카페 투어의 마지막 휴식 장소로 어울려요.'),
    ('685871c2-0fe0-46d0-ae2a-ae1a38801967'::uuid, 0, 'primary', 'd0f5f689-ceaf-47dc-b1cd-09d715c493a0'::uuid, '리로드', '파주 북부 라이딩의 출발과 모임 장소로 좋아요.'),
    ('685871c2-0fe0-46d0-ae2a-ae1a38801967'::uuid, 1, 'stop', '1569a1a6-d79f-4096-a737-449f3288d66d'::uuid, '라드', '양주까지 이어 달린 뒤 쉬어가기 좋아요.'),
    ('468dd12c-fec2-44b4-a2c3-b0340e7cb396'::uuid, 0, 'primary', '7fb58804-550e-47ac-85f8-c10539b77d2d'::uuid, '포천아우토반카페', '철원 방향 산길을 달리며 페이스를 조절하기 좋아요.'),
    ('468dd12c-fec2-44b4-a2c3-b0340e7cb396'::uuid, 1, 'stop', '81c7be22-2b21-4368-a9bb-50228f90be51'::uuid, '바이크와커피가만나다', '포천에서 북쪽으로 출발하기 전 쉬어가기 좋아요.'),
    ('f378a885-2b8c-44ef-af81-594af84fd9ac'::uuid, 0, 'primary', '1e82e839-204d-401d-9c42-4e3b7a6bbe03'::uuid, '성삼재휴게소', '해발 1,102m 정상에서 지리산 능선을 볼 수 있어요.'),
    ('f378a885-2b8c-44ef-af81-594af84fd9ac'::uuid, 1, 'stop', 'af4ae0dc-3381-42e3-b121-03d5aa4a229f'::uuid, '정령치휴게소', '연속 코너 뒤 쉬어가며 산악 풍경을 즐길 수 있어요.')
)
insert into public.riding_guide_stops (
  guide_id,
  position,
  role,
  place_id,
  note
)
select
  mapped.guide_id,
  mapped.position,
  mapped.role,
  mapped.place_id,
  mapped.note
from mapped_stops mapped
join public.riding_guides guide on guide.id = mapped.guide_id
join public.places place
  on place.id = mapped.place_id
  and place.name = mapped.place_name
  and place.approved is true
  and place.deleted_at is null
on conflict (guide_id, position) do nothing;
