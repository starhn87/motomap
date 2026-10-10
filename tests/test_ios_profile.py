import importlib.util
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('ios_profile', Path(__file__).resolve().parents[1] / 'scripts/profile-ios.py')
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)


class ProfileTests(unittest.TestCase):
    def test_weighted_cpu_clips_boundary_and_ignores_missing(self):
        rows = [
            {'start_s': 9, 'duration_s': 3, 'cpu_percent': 12},
            {'start_s': 12, 'duration_s': 2, 'cpu_percent': None},
            {'start_s': 14, 'duration_s': 7, 'cpu_percent': 4},
        ]
        self.assertEqual(profile.weighted_cpu(rows, 10, 20), {'percent': 6, 'covered_s': 8})

    def test_quantiles_include_failures_and_single_sample(self):
        def metrics(n):
            return dict(peak_footprint_mib=n, last_footprint_mib=n, last_cpu_time_s=n,
                        cpu_10_20={'percent': n, 'covered_s': 10},
                        cpu_20_30={'percent': n, 'covered_s': 1})
        result = profile.aggregate([{'status': 'ok', 'metrics': metrics(3)}, {'status': 'failed'},
                                    {'status': 'ok', 'metrics': metrics(1)}])
        self.assertEqual(result['failed'], 1)
        self.assertEqual(result['peak_footprint_mib']['p50'], 2)
        self.assertEqual(result['peak_footprint_mib']['p90'], 3)
        self.assertIsNone(result['cpu_20_30'])

    def test_xml_resolves_refs_and_excludes_other_processes(self):
        xml = '''<trace-query-result><node><schema name="activity-monitor-process-live">
        <col><mnemonic>start</mnemonic></col><col><mnemonic>duration</mnemonic></col>
        <col><mnemonic>process</mnemonic></col><col><mnemonic>cpu-percent</mnemonic></col>
        <col><mnemonic>cpu-total</mnemonic></col><col><mnemonic>memory-physical-footprint</mnemonic></col>
        </schema><row><start id="s">10000000000</start><duration id="d">1000000000</duration>
        <process id="p" fmt="모토맵 (42)"><name>모토맵</name></process>
        <percent id="c">2</percent><cpu id="t">500000000</cpu><size id="m">104857600</size></row>
        <row><start>11000000000</start><duration ref="d"/><process ref="p"/>
        <percent ref="c"/><cpu ref="t"/><size ref="m"/></row>
        <row><start ref="s"/><duration ref="d"/><process fmt="kernel (0)"/>
        <percent>99</percent><cpu ref="t"/><size>9999999999</size></row></node></trace-query-result>'''
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'live.xml'
            path.write_text(xml)
            rows = profile.read_live(path)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[1]['cpu_s'], .5)
            self.assertEqual(profile.summarize(path)['peak_footprint_mib'], 100)

    def test_raw_output_cannot_be_inside_repo(self):
        with self.assertRaises(ValueError):
            profile.private_output(profile.ROOT / 'private-traces')

    def test_search_route_is_dispatched_by_collector_at_twenty_seconds(self):
        process = Mock()
        process.poll.side_effect = [None, 0]
        process.wait.return_value = 0
        args = SimpleNamespace(device='fixture-device', seconds=90, search_idle=True)
        with tempfile.TemporaryDirectory() as tmp, patch.object(profile.subprocess, 'Popen', return_value=process), \
             patch.object(profile.time, 'sleep') as sleep, patch.object(profile, 'command') as run:
            profile.record_command(args, Path(tmp) / 'sample', 'fixture.trace')
            sleep.assert_called_once_with(20)
            self.assertIn('ridemap://search', run.call_args.args[0])
            self.assertNotIn('--terminate-existing', run.call_args.args[0])
            process.terminate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
