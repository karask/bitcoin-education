"""Known Bitcoin vectors, trace consistency, and adapter validation in CPython."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ROOT / '.test-artifacts' / 'python-packages'
PACKAGES.mkdir(parents=True, exist_ok=True)
for wheel in json.loads((ROOT / 'public/runtime/manifest.json').read_text())['wheels']:
    with zipfile.ZipFile(ROOT / 'public/runtime' / wheel['path']) as archive:
        archive.extractall(PACKAGES)
sys.path.insert(0, str(PACKAGES))
spec = importlib.util.spec_from_file_location('lesson_adapter', ROOT / 'public/python/lesson_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
VECTORS = [
    ('mainnet', True, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'),
    ('mainnet', False, '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm'),
    ('testnet', True, 'mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r'),
    ('testnet', False, 'mtoKs9V381UAhUia3d7Vb9GNak8Qvmcsme'),
]


def trace(network='mainnet', compressed=True, public_key=PUBLIC_KEY):
    return json.loads(adapter.trace_p2pkh(json.dumps({'network': network, 'compressed': compressed, 'publicKey': public_key})))


class P2pkhTests(unittest.TestCase):
    def test_known_vectors_and_network_isolation(self):
        for network, compressed, expected in VECTORS + VECTORS[::-1]:
            with self.subTest(network=network, compressed=compressed):
                result = trace(network, compressed)
                self.assertEqual(result['address'], expected)
                self.assertEqual(result['steps'][0]['byteLength'], 33 if compressed else 65)
                self.assertEqual(result['steps'][6]['hex'][:2], '00' if network == 'mainnet' else '6f')

    def test_known_intermediate_bytes(self):
        result = trace()
        self.assertEqual(result['steps'][2]['hex'], '751e76e8199196d454941c45d1b3a323f1433bd6')
        self.assertEqual(result['steps'][5]['hex'], '510d1634')
        self.assertEqual(result['steps'][6]['hex'], '00751e76e8199196d454941c45d1b3a323f1433bd6510d1634')

    def test_byte_annotations_cover_the_correct_fields(self):
        for network, compressed, _ in VECTORS:
            for step in trace(network, compressed)['steps']:
                self.assertEqual(len(step['hex']), step['byteLength'] * 2)
                covered = [i for field in step['fields'] for i in range(field['start'], field['end'])]
                self.assertEqual(covered, list(range(step['byteLength'])))
        self.assertEqual([(f['start'], f['end']) for f in trace()['steps'][6]['fields']], [(0, 1), (1, 21), (21, 25)])

    def test_displayed_python_is_runnable_and_identical(self):
        for network, compressed, _ in VECTORS:
            result = trace(network, compressed)
            namespace = {}
            exec(result['pythonPreamble'] + '\n\n' + '\n\n'.join(step['python'] for step in result['steps']), namespace)
            self.assertEqual(namespace['address'], result['address'])
            self.assertEqual(namespace['address_bytes'].hex(), result['steps'][6]['hex'])
            self.assertEqual(namespace['checksum_sha256'].hex(), result['steps'][4]['intermediate']['hex'])

    def test_input_normalization(self):
        self.assertEqual(trace(public_key=' 0x' + PUBLIC_KEY.upper() + ' ')['address'], VECTORS[0][2])
        uncompressed = trace(compressed=False)['publicKey']
        self.assertEqual(trace(public_key=uncompressed)['address'], VECTORS[0][2])

    def test_invalid_input(self):
        for key in ['', 'abcd', 'zz' * 33, '05' + '00' * 32, '02' + 'ff' * 32]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                trace(public_key=key)
        with self.assertRaises(ValueError):
            trace(network='unknown')


if __name__ == '__main__':
    unittest.main()
