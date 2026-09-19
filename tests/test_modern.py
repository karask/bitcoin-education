"""Published BIP vectors and independent checks for the browser address lessons.

The reference encoding/hash calculations here are test-only; the application
uses python-bitcoin-utils for every Bitcoin operation.
Sources: BIP173 Examples; BIP350 test vectors; BIP341 wallet-test-vectors.json,
first scriptPubKey vector (no script tree).
"""
import hashlib
import json
import unittest
from test_p2pkh import adapter, PUBLIC_KEY
from test_p2sh import KEYS
from bitcoinutils.bech32 import decode

KINDS = ('p2wpkh', 'p2wsh', 'nested', 'p2tr', 'compare')
TAPROOT_VECTOR = dict(
    internal='d6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d',
    tweak='b86e7be8f39bab32a6f2c0443abbc210f0edac0e2c53d501b36b64437d9c6c70',
    output='53a1f6e454df1aa2776a2814a721372d6258050de330b3c6d10ee8f4e0dda343',
    address='bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
)


def trace(kind, network='mainnet', **changes):
    request = dict(kind=kind, publicKey=PUBLIC_KEY, publicKeys=KEYS, threshold=2, network=network)
    request.update(changes)
    return json.loads(adapter.trace_lesson(json.dumps(request)))


def reference_bech32(hrp, version, program):
    alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
    bits = ''.join(f'{b:08b}' for b in program)
    bits += '0' * ((-len(bits)) % 5)
    data = [version] + [int(bits[i:i+5], 2) for i in range(0, len(bits), 5)]
    residue = 1
    for value in [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp] + data + [0]*6:
        top = residue >> 25
        residue = ((residue & 0x1ffffff) << 5) ^ value
        for index, generator in enumerate((0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3)):
            if (top >> index) & 1:
                residue ^= generator
    residue ^= 1 if version == 0 else 0x2bc830a3
    checksum = [(residue >> shift) & 31 for shift in (25, 20, 15, 10, 5, 0)]
    return hrp + '1' + ''.join(alphabet[v] for v in data + checksum), data, checksum


class ModernTests(unittest.TestCase):
    def test_bip173_public_key_and_single_script_examples(self):
        for network, key_address, script_address in [
            ('mainnet', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'),
            ('testnet', 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7'),
        ]:
            self.assertEqual(trace('p2wpkh', network)['address'], key_address)
            comparison = trace('compare', network)['comparisons']
            self.assertEqual(comparison[2]['address'], key_address)
            self.assertEqual(comparison[3]['address'], script_address)
            self.assertEqual(comparison[3]['script'], '00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262')

    def test_bip341_no_tree_vector_and_odd_internal_key(self):
        for prefix in ('02', '03'):
            result = trace('p2tr', publicKey=prefix + TAPROOT_VECTOR['internal'])
            by_id = {s['id']: s for s in result['steps']}
            self.assertEqual(by_id['tweak']['hex'], TAPROOT_VECTOR['tweak'])
            self.assertEqual(by_id['output-key']['hex'], TAPROOT_VECTOR['output'])
            self.assertEqual(result['outputScript']['hex'], '5120' + TAPROOT_VECTOR['output'])
            self.assertEqual(result['address'], TAPROOT_VECTOR['address'])

    def test_bech32_and_bech32m_symbols_and_padding(self):
        for kind in ('p2wpkh', 'p2wsh', 'p2tr'):
            for network, hrp in [('mainnet', 'bc'), ('testnet', 'tb')]:
                for public_key in KEYS + ['03' + PUBLIC_KEY[2:]]:
                    result = trace(kind, network, publicKey=public_key)
                    version = 1 if kind == 'p2tr' else 0
                    program = bytes.fromhex(result['outputScript']['hex'])[2:]
                    expected, data, checksum = reference_bech32(hrp, version, program)
                    self.assertEqual(result['address'], expected)
                    by_id = {s['id']: s for s in result['steps']}
                    self.assertEqual(by_id['groups']['symbols']['values'], data)
                    self.assertEqual(by_id['checksum']['symbols']['values'], checksum)
                    self.assertEqual(''.join(p['value'] for p in by_id['address']['addressParts']), expected)
                    self.assertEqual(decode(hrp, expected), (version, list(program)))
                    corrupted = expected[:-1] + ('q' if expected[-1] != 'q' else 'p')
                    self.assertEqual(decode(hrp, corrupted), (None, None))
                    self.assertEqual(decode(hrp, expected[:3].upper() + expected[3:]), (None, None))

    def test_bip350_wrong_checksum_family_vectors(self):
        for address in [
            'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
            'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
        ]:
            self.assertEqual(decode('bc', address), (None, None))

    def test_nested_wrapping_uses_raw_script(self):
        result = trace('nested')
        inner = trace('p2wpkh')['outputScript']['hex']
        self.assertEqual(result['relatedScripts'][0]['result']['hex'], inner)
        script_hash = hashlib.new('ripemd160', hashlib.sha256(bytes.fromhex(inner)).digest()).hexdigest()
        self.assertEqual(result['outputScript']['hex'], 'a914' + script_hash + '87')
        self.assertEqual(result['address'], '3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN')

    def test_witness_script_hash_and_multisig_inputs(self):
        addresses = set()
        for threshold in (1, 2, 3):
            for keys in (KEYS, KEYS[::-1]):
                result = trace('p2wsh', threshold=threshold, publicKeys=keys)
                expected_script = bytes([0x50 + threshold]) + b''.join(b'\x21' + bytes.fromhex(k) for k in keys) + b'\x53\xae'
                digest = hashlib.sha256(expected_script).hexdigest()
                self.assertEqual(result['steps'][0]['hex'], expected_script.hex())
                self.assertEqual(result['steps'][1]['hex'], digest)
                self.assertEqual(result['outputScript']['hex'], '0020' + digest)
                addresses.add(result['address'])
        self.assertEqual(len(addresses), 6)

    def test_annotations_python_replay_and_network_independence(self):
        for kind in KINDS:
            outputs = []
            for network in ('mainnet', 'testnet', 'mainnet'):
                result = trace(kind, network)
                namespace = {}
                exec(result['pythonPreamble'], namespace)
                for s in result['steps']:
                    exec(s['python'], namespace)
                    if 'address' in s:
                        self.assertEqual(s['address'], namespace['address'])
                    if 'symbols' in s:
                        self.assertEqual(s['fields'], [])
                        self.assertTrue(all(0 <= value <= 31 for value in s['symbols']['values']))
                        continue
                    self.assertEqual(len(s['hex']), s['byteLength'] * 2)
                    self.assertEqual([i for f in s['fields'] for i in range(f['start'], f['end'])], list(range(s['byteLength'])))
                if result.get('outputScript'):
                    output = result['outputScript']
                    # The full copyable example replays this snippet after all steps.
                    exec(output['python'], namespace)
                    self.assertEqual(namespace['output_bytes'].hex(), output['hex'])
                    outputs.append(output['hex'])
                else:
                    outputs.append([row['script'] for row in result['comparisons']])
            self.assertEqual(outputs[0], outputs[1])
            self.assertEqual(outputs[0], outputs[2])

    def test_comparison_shapes_and_linked_lessons(self):
        rows = trace('compare')['comparisons']
        self.assertEqual([r['scriptBytes'] for r in rows], [25, 23, 22, 34, 23, 34])
        for index, kind in [(2, 'p2wpkh'), (4, 'nested'), (5, 'p2tr')]:
            individual = trace(kind)
            self.assertEqual(rows[index]['address'], individual['address'])
            self.assertEqual(rows[index]['script'], individual['outputScript']['hex'])

    def test_invalid_keys_and_requests(self):
        for kind in KINDS:
            with self.assertRaises(ValueError):
                trace(kind, network='invalid')
        for kind in ('p2wpkh', 'nested', 'p2tr', 'compare'):
            for value in ['', None, '04' + '00'*64, '02' + 'ff'*32, 'zz'*33]:
                with self.assertRaises(ValueError):
                    trace(kind, publicKey=value)
        for changes in [dict(threshold=0), dict(threshold=True), dict(publicKeys=[KEYS[0]]*3), dict(publicKeys=[])]:
            with self.assertRaises(ValueError):
                trace('p2wsh', **changes)
        with self.assertRaises(ValueError):
            trace('unknown')


def wasm_vectors():
    cases = [dict(kind=kind, network=network, publicKey=key, publicKeys=KEYS, threshold=2)
             for kind in KINDS for network in ('mainnet', 'testnet')
             for key in (PUBLIC_KEY, '03' + PUBLIC_KEY[2:])]
    cases += [dict(kind='p2wsh', network='mainnet', publicKeys=KEYS[::-1], threshold=n) for n in (1, 3)]
    cases.append(dict(kind='p2tr', network='mainnet', publicKey='02' + TAPROOT_VECTOR['internal']))
    return [dict(input=c, trace=json.loads(adapter.trace_lesson(json.dumps(c)))) for c in cases]
