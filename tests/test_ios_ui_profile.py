import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ui_profile', ROOT / 'scripts/ios-ui-profile/run.py')
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)


class UIProfileTests(unittest.TestCase):
    def test_metrics_exclude_identifiers(self):
        raw = [{'testIdentifier': 'private-test', 'testRuns': [{
            'device': {'deviceId': 'private-device'},
            'metrics': [{'displayName': 'CPU time', 'unitOfMeasurement': 's',
                         'measurements': [1, 2.5], 'baselineName': 'private-baseline'}],
        }]}]
        self.assertEqual(profile.clean_metrics(raw), [{'name': 'CPU time', 'unit': 's', 'values': [1, 2.5]}])

    def test_bad_metrics_are_not_zero(self):
        for values in ([], [None], [True], [float('inf')], [float('nan')]):
            with self.assertRaises(ValueError):
                profile.clean_metrics([{'testRuns': [{'metrics': [{
                    'displayName': 'Memory', 'unitOfMeasurement': 'MB', 'measurements': values}]}]}])
        with self.assertRaises(ValueError):
            profile.clean_metrics({})

    def test_private_output_and_no_overwrite(self):
        with self.assertRaises(ValueError):
            profile.private_output(ROOT / 'measurement-raw')
        with tempfile.TemporaryDirectory(prefix='motomap-ui-test-') as parent:
            path = Path(parent) / 'new'
            self.assertEqual(profile.private_output(path), path.resolve())
            self.assertEqual(path.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                profile.private_output(path)


if __name__ == '__main__':
    unittest.main()
