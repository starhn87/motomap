"""승인된 실기기 UI 러너만 서명·실행한다. 앱 설치/데이터 초기화/배포는 하지 않는다."""
import argparse
import json
import math
import os
import re
import signal
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCENARIOS = {
    'smoke': 'testPhotoGestureSmoke',
    'photo': 'testPhotoLoops',
    'search': 'testSearchIdle',
}


def private_output(value):
    path = Path(value).resolve()
    if path == ROOT or ROOT in path.parents:
        raise ValueError('원본은 저장소 밖에만 기록한다')
    path.mkdir(mode=0o700, exist_ok=False)
    return path


def clean_metrics(data):
    # 기기 식별자·테스트 스크린샷·사용자 데이터는 집계에서 제외한다.
    if not isinstance(data, list):
        raise ValueError('지원하지 않는 xcresult metrics 스키마')
    metrics = []
    for test in data:
        for run in test['testRuns']:
            for metric in run['metrics']:
                values = metric['measurements']
                if not values or not all(type(v) in (int, float) and math.isfinite(v) for v in values):
                    raise ValueError('측정값 없음 또는 잘못된 수치')
                metrics.append({
                    'name': metric['displayName'],
                    'unit': metric['unitOfMeasurement'],
                    'values': values,
                })
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', required=True)
    parser.add_argument('--team', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--scenario', choices=SCENARIOS, required=True)
    parser.add_argument('--blocks', type=int, choices=range(1, 4), default=3)
    parser.add_argument('--ruby', default='ruby')
    parser.add_argument('--gem-home', help='기존 CocoaPods의 xcodeproj gem 경로; 신규 설치 안 함')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Z0-9]{10}', args.team):
        raise ValueError('잘못된 team ID')
    if not re.fullmatch(r'[A-Za-z0-9-]+', args.device):
        raise ValueError('잘못된 기기 ID')
    output = private_output(args.output)
    environment = os.environ.copy()
    if args.gem_home:
        environment['GEM_HOME'] = args.gem_home

    def command(argv, log, timeout):
        with log.open('wb') as stream:
            subprocess.run(argv, env=environment, stdout=stream, stderr=subprocess.STDOUT,
                           check=True, timeout=timeout)

    project = output / 'project'
    command([args.ruby, str(HERE / 'create-project.rb'), str(project), args.team],
            output / 'project.log', 30)
    base = ['xcodebuild', '-project', str(project / 'MotoMapProfile.xcodeproj'),
            '-scheme', 'MotoMapProfile', '-configuration', 'Release',
            '-destination', f'platform=iOS,id={args.device}',
            '-derivedDataPath', str(output / 'derived'),
            '-allowProvisioningUpdates', '-parallel-testing-enabled', 'NO',
            '-only-testing:MotoMapProfile/MotoMapProfile/' + SCENARIOS[args.scenario]]
    results = []

    def run_photo(argv, block):
        log = output / f'block-{block}.log'
        trace_log = (output / f'block-{block}-trace.log').open('wb')
        trace = None
        with log.open('wb') as stream:
            test = subprocess.Popen(argv, env=environment, stdout=stream, stderr=subprocess.STDOUT)
            try:
                started = time.monotonic()
                while test.poll() is None:
                    content = log.read_text(errors='replace')
                    if trace is None and 'MOTOMAP_PHOTO_READY' in content:
                        pids = re.findall(r'snapshot of accessibility hierarchy for app with pid (\d+)', content)
                        if not pids:
                            raise ValueError('측정할 앱 PID 없음')
                        trace = subprocess.Popen([
                            'xcrun', 'xctrace', 'record', '--template', 'Activity Monitor',
                            '--device', args.device, '--attach', pids[-1], '--time-limit', '600s',
                            '--output', str(output / f'block-{block}.trace')],
                            stdout=trace_log, stderr=subprocess.STDOUT)
                        print(f'block {block}: photo trace started', flush=True)
                    if trace is not None and trace.poll() is not None:
                        raise ValueError('UI 반복이 끝나기 전에 trace가 종료됨')
                    if time.monotonic() - started > 900:
                        raise ValueError('UI 테스트 시간 제한 초과')
                    time.sleep(1)
                if test.returncode:
                    raise ValueError('사진 UI 검증 실패')
                if trace is None:
                    raise ValueError('사진 준비 상태 미확인')
                trace.send_signal(signal.SIGINT)
                if trace.wait(timeout=60) != 0:
                    raise ValueError('trace 저장 실패')
            finally:
                for child in (test, trace):
                    if child is not None and child.poll() is None:
                        child.terminate()
                        try:
                            child.wait(timeout=15)
                        except subprocess.TimeoutExpired:
                            child.kill()
                            child.wait(timeout=15)
                trace_log.close()
        command(['xcrun', 'xctrace', 'export', '--input', str(output / f'block-{block}.trace'),
                 '--toc', '--output', str(output / f'block-{block}-toc.xml')],
                output / f'block-{block}-toc.log', 60)
        command(['xcrun', 'xctrace', 'export', '--input', str(output / f'block-{block}.trace'),
                 '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="activity-monitor-process-live"]',
                 '--output', str(output / f'block-{block}-live.xml')],
                output / f'block-{block}-export.log', 60)

    for block in range(1, args.blocks + 1):
        result = output / f'block-{block}.xcresult'
        argv = base + ['-resultBundlePath', str(result), 'test']
        if args.scenario == 'photo':
            run_photo(argv, block)
        else:
            command(argv, output / f'block-{block}.log', 900)
        report = json.loads(subprocess.check_output([
            'xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', str(result), '--compact']))
        if report['failedTests'] or report['passedTests'] != 1:
            raise ValueError('실기기 동작 검증 미통과')
        raw = subprocess.check_output([
            'xcrun', 'xcresulttool', 'get', 'test-results', 'metrics', '--path', str(result), '--compact'])
        (output / f'block-{block}-metrics-private.json').write_bytes(raw)
        metrics = clean_metrics(json.loads(raw))
        if args.scenario != 'smoke' and not metrics:
            raise ValueError('메트릭 없는 블록')
        results.append({'block': block, 'metrics': metrics})
        (output / 'summary.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print(f'block {block}: verified', flush=True)


if __name__ == '__main__':
    # 자세한 실패·진단·스크린샷은 지정된 private 디렉터리에서 확인한다.
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f'측정 중단: {type(error).__name__} (원본 private 로그 확인)', flush=True)
        raise SystemExit(1)
