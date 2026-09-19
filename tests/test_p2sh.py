"""P2SH vectors, network independence, and runnable lesson snippets."""
import hashlib
import json
import unittest
from test_p2pkh import adapter
from bitcoinutils.keys import PrivateKey, P2shAddress

KEYS = [PrivateKey(secret_exponent=n).get_public_key().to_hex() for n in (1, 2, 3)]


def trace(network='mainnet', threshold=2, keys=None):
    return json.loads(adapter.trace_p2sh(json.dumps(dict(network=network, threshold=threshold, publicKeys=KEYS if keys is None else keys))))


class P2shTests(unittest.TestCase):
    def test_script_and_address_against_independent_encoding(self):
        alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
        for network in ('mainnet', 'testnet'):
            for threshold in (1, 2, 3):
                result = trace(network, threshold)
                script = bytes([0x50 + threshold]) + b''.join(b'\x21' + bytes.fromhex(k) for k in KEYS) + b'\x53\xae'
                digest = hashlib.new('ripemd160', hashlib.sha256(script).digest()).digest()
                payload = bytes([5 if network == 'mainnet' else 196]) + digest
                checked = payload + hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
                value = int.from_bytes(checked, 'big')
                encoded = ''
                while value:
                    value, remainder = divmod(value, 58)
                    encoded = alphabet[remainder] + encoded
                self.assertEqual(result['address'], encoded)
                self.assertEqual(result['steps'][0]['hex'], script.hex())
                self.assertEqual(result['steps'][6]['hex'], checked.hex())
                self.assertEqual(result['outputScript']['hex'], 'a914' + digest.hex() + '87')
                self.assertEqual(P2shAddress(address=encoded).to_script_pub_key().to_hex(), result['outputScript']['hex'])

    def test_known_default_vector(self):
        self.assertEqual(trace()['address'], '33hG2q39jRi2NqicRJB4ggY1J8EJm97Szz')

    def test_annotations_and_displayed_code(self):
        for network in ('mainnet', 'testnet'):
            for threshold in (1, 2, 3):
                result = trace(network, threshold)
                for step in result['steps'] + [result['outputScript']]:
                    self.assertEqual([i for f in step['fields'] for i in range(f['start'], f['end'])], list(range(step['byteLength'])))
                namespace = {}
                exec(result['pythonPreamble'] + '\n' + '\n'.join(s['python'] for s in result['steps']) + '\n' + result['outputScript']['python'], namespace)
                self.assertEqual(namespace['address'], result['address'])
                self.assertEqual(namespace['output_bytes'].hex(), result['outputScript']['hex'])

    def test_experiments(self):
        baseline = trace()
        testnet = trace('testnet')
        self.assertEqual(baseline['steps'][:3], testnet['steps'][:3])
        self.assertEqual(baseline['outputScript'], testnet['outputScript'])
        self.assertNotEqual(baseline['address'], testnet['address'])
        self.assertNotEqual(baseline['address'], trace(threshold=3)['address'])
        self.assertNotEqual(baseline['address'], trace(keys=KEYS[::-1])['address'])
        self.assertEqual(baseline['address'], trace(keys=[' 0x'+k.upper()+' ' for k in KEYS])['address'])

    def test_invalid_inputs(self):
        for keys in ([], KEYS[:2], [KEYS[0]]*3, ['', *KEYS[1:]], ['02'+'ff'*32, *KEYS[1:]], [None, *KEYS[1:]]):
            with self.assertRaises(ValueError):
                trace(keys=keys)
        for threshold in (0, 4, True, 2.0, '2'):
            with self.assertRaises(ValueError):
                trace(threshold=threshold)
        with self.assertRaises(ValueError):
            trace('unknown')
