"""모토맵만 반복 launch 기록하고 익명화된 Activity Monitor 수치를 집계한다.

원본 trace/XML은 저장소 밖 private 디렉터리에만 둔다. 설치·배포·데이터 초기화는 하지 않는다.
"""
import argparse
import json
import math
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = 'com.ridemap.app'
SCHEMA = 'activity-monitor-process-live'


def read_live(path):
    root = ET.parse(path).getroot()
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}

    def resolve(e):
        seen = set()
        while e.get('ref'):
            ref = e.get('ref')
            if ref in seen or ref not in ids:
                raise ValueError('XML 참조를 해석할 수 없음')
            seen.add(ref)
            e = ids[ref]
        return e

    rows = []
    # xctrace export는 table 내용을 node 안에 반환한다. 테스트/다른 export의 table도 허용한다.
    for table in root.iter():
        schema = table.find('schema')
        if schema is None or schema.get('name') != SCHEMA:
            continue
        columns = [col.findtext('mnemonic') for col in schema.findall('col')]
        required = {'start', 'duration', 'process', 'cpu-percent', 'cpu-total', 'memory-physical-footprint'}
        if not required.issubset(columns):
            raise ValueError('지원하지 않는 Activity Monitor 스키마')
        for row in table.findall('row'):
            if len(row) != len(columns):
                raise ValueError('열 개수 불일치')
            cells = dict(zip(columns, [resolve(e) for e in row]))
            process = cells['process']
            name = process.findtext('name')
            if name != '모토맵' and not re.fullmatch(r'모토맵 \(\d+\)', process.get('fmt', '')):
                continue

            def number(key):
                cell = cells[key]
                if cell.tag == 'sentinel' or cell.text is None:
                    return None
                value = float(cell.text)
                if not math.isfinite(value):
                    raise ValueError('유효하지 않은 수치')
                return value

            rows.append({
                'start_s': number('start') / 1e9,
                'duration_s': number('duration') / 1e9,
                'footprint_mib': number('memory-physical-footprint') / 1048576,
                'cpu_s': None if number('cpu-total') is None else number('cpu-total') / 1e9,
                'cpu_percent': number('cpu-percent'),
            })
    if not rows:
        raise ValueError('모토맵 process-live 표본 없음')
    return sorted(rows, key=lambda row: row['start_s'])


def weighted_cpu(rows, start, end):
    # 경계와 겹치는 표본은 겹친 시간만 가중한다. 퍼센트는 Instruments 정의 그대로다.
    weighted = duration = 0
    for row in rows:
        overlap = max(0, min(end, row['start_s'] + row['duration_s']) - max(start, row['start_s']))
        if row['cpu_percent'] is not None and overlap:
            weighted += row['cpu_percent'] * overlap
            duration += overlap
    return {'percent': weighted / duration if duration else None, 'covered_s': duration}


def summarize(path):
    rows = read_live(path)
    last = rows[-1]
    elapsed = last['start_s'] + last['duration_s']
    return {
        'sample_count': len(rows),
        'covered_end_s': elapsed,
        'peak_footprint_mib': max(row['footprint_mib'] for row in rows),
        'last_footprint_mib': last['footprint_mib'],
        'last_cpu_time_s': last['cpu_s'],
        'cpu_10_20': weighted_cpu(rows, 10, 20),
        'cpu_20_30': weighted_cpu(rows, 20, 30),
    }


def aggregate(runs):
    def distribution(values):
        values = sorted(values)
        n = len(values)
        if not n:
            return None
        return {
            'n': n, 'min': values[0], 'max': values[-1],
            'p50': (values[(n - 1) // 2] + values[n // 2]) / 2,
            # P90はnearest-rank。小標本の上位値を精密な分位点と解釈しない。
            'p90': values[math.ceil(n * .9) - 1],
        }
    valid = [r['metrics'] for r in runs if r.get('status') == 'ok']
    result = {'attempts': len(runs), 'valid': len(valid), 'failed': len(runs) - len(valid)}
    for key in ['peak_footprint_mib', 'last_footprint_mib', 'last_cpu_time_s']:
        result[key] = distribution([r[key] for r in valid if r[key] is not None])
    for key in ['cpu_10_20', 'cpu_20_30']:
        result[key] = distribution([r[key]['percent'] for r in valid if r[key]['covered_s'] >= 8])
    return result


def private_output(value):
    path = Path(value).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('원본 수집 디렉터리는 저장소 밖이어야 함')
    # 새 디렉터리만 허용해 과거 trace/결과를 덮어쓰지 않는다.
    path.mkdir(mode=0o700, parents=False, exist_ok=False)
    return path


def command(args, log):
    with log.open('wb') as stream:
        subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=240)


def record(args):
    out = private_output(args.output)
    runs = []
    metadata = {
        'scenario': 'process-launch-map', 'label': args.label,
        'duration_s': args.seconds, 'rest_s': args.rest,
        'conditions': 'user confirmed wired/unlocked/same Wi-Fi/low-power off; brightness/thermal/cache uncontrolled',
        'tool': 'Activity Monitor', 'rows': runs,
    }
    for index in range(1, args.count + 1):
        prefix = out / f'run-{index:02}'
        trace = str(prefix) + '.trace'
        live = str(prefix) + '-live.xml'
        entry = {'run': index, 'status': 'failed'}
        runs.append(entry)
        print(f'[{index}/{args.count}] 모토맵 {args.seconds}초 기록 시작', flush=True)
        try:
            command(['xcrun', 'xctrace', 'record', '--template', 'Activity Monitor',
                     '--device', args.device, '--time-limit', f'{args.seconds}s',
                     '--output', trace, '--launch', '--', BUNDLE], Path(str(prefix) + '-record.log'))
            command(['xcrun', 'xctrace', 'export', '--input', trace, '--toc',
                     '--output', str(prefix) + '-toc.xml'], Path(str(prefix) + '-toc.log'))
            toc = ET.parse(str(prefix) + '-toc.xml').getroot()
            if not any(p.get('name') == '모토맵' for p in toc.iter('process')):
                raise ValueError('trace의 대상 프로세스가 모토맵이 아님')
            command(['xcrun', 'xctrace', 'export', '--input', trace,
                     '--xpath', f'/trace-toc/run[@number="1"]/data/table[@schema="{SCHEMA}"]',
                     '--output', live], Path(str(prefix) + '-export.log'))
            metrics = summarize(live)
            if metrics['covered_end_s'] < args.seconds - 3 or metrics['sample_count'] < 10:
                raise ValueError('기록 구간이 짧거나 표본 부족')
            entry.update(status='ok', metrics=metrics)
            print(f'[{index}/{args.count}] peak {metrics["peak_footprint_mib"]:.1f} MiB / '
                  f'끝 {metrics["last_footprint_mib"]:.1f} MiB', flush=True)
        except (subprocess.SubprocessError, ValueError, OSError, ET.ParseError) as error:
            # 원본 오류에는 기기 이름/경로가 섞일 수 있어 공개 출력에는 클래스만 남긴다.
            entry['error_type'] = type(error).__name__
            print(f'[{index}/{args.count}] 실패: {type(error).__name__}; 원본은 private log', flush=True)
        metadata['aggregate'] = aggregate(runs)
        (out / 'summary.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
        if entry['status'] != 'ok':
            break
        if index < args.count:
            time.sleep(args.rest)
    # profiler 종료 후 정상 실행으로 돌린다. 설치·삭제나 다른 앱 조작은 하지 않는다.
    command(['xcrun', 'devicectl', 'device', 'process', 'launch', '--device', args.device,
             '--json-output', str(out / 'normal-launch.json'), BUNDLE], out / 'normal-launch.log')
    print(json.dumps(metadata['aggregate'], ensure_ascii=False), flush=True)
    return 0 if all(r['status'] == 'ok' for r in runs) and len(runs) == args.count else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='action', required=True)
    inspect = subs.add_parser('summarize')
    inspect.add_argument('xml')
    runner = subs.add_parser('record')
    runner.add_argument('--device', required=True)
    runner.add_argument('--output', required=True)
    runner.add_argument('--label', required=True)
    runner.add_argument('--count', type=int, choices=range(1, 21), default=3)
    runner.add_argument('--seconds', type=int, choices=range(30, 151), default=30)
    runner.add_argument('--rest', type=int, choices=range(0, 61), default=10)
    args = parser.parse_args()
    if args.action == 'summarize':
        print(json.dumps(summarize(args.xml), ensure_ascii=False, indent=2))
        return 0
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', args.label):
        parser.error('label은 익명 시나리오 이름만 사용한다')
    return record(args)


if __name__ == '__main__':
    raise SystemExit(main())
