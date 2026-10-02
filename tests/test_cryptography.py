"""Known-point, signature, boundary, replay and cross-runtime lesson checks."""
import contextlib
import hashlib
import io
import json
import unittest
from python_test_support import adapter
from ecdsa import SECP256k1, VerifyingKey, BadSignatureError
from ecdsa.util import sigdecode_der


def request(d=7, experiment='original', message='Bitcoin makes more sense one step at a time.', page='ecdsa'):
    return dict(kind=page, network='mainnet', cryptography=dict(privateHex=f'{d:064x}', message=message, experiment=experiment))


def trace(req):
    return json.loads(adapter.trace_lesson(json.dumps(req)))['cryptography']


def wasm_vectors():
    requests = [request(d, experiment) for d in (1, 7, SECP256k1.order - 1) for experiment in ('original', 'message', 'key', 'signature')]
    requests += [request(13, message='Ελληνικά ₿'), request(3, message=''), request(7, page='private-keys'), request(7, page='public-keys')]
    return [dict(input=req, trace=json.loads(adapter.trace_lesson(json.dumps(req)))) for req in requests]


class CryptographyTests(unittest.TestCase):
    def test_known_generator_and_two_g_encodings(self):
        data = trace(request(1))
        self.assertEqual(data['compressed'], '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')
        self.assertEqual(data['Q'], data['G'])
        self.assertEqual(trace(request(2))['compressed'], '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5')
        self.assertEqual(len(data['uncompressed']), 130)
        self.assertEqual(data['uncompressed'], '04' + data['Q']['x'] + data['Q']['y'])

    def test_curve_equation_parity_decompression_and_binary_recurrence(self):
        p = SECP256k1.curve.p()
        for d in (1, 2, 6, 7, 13, SECP256k1.order - 1):
            data = trace(request(d))
            x, y = int(data['Q']['x'], 16), int(data['Q']['y'], 16)
            self.assertEqual((y*y - x*x*x - 7) % p, 0)
            self.assertEqual(int(data['compressed'][:2], 16), 2 + y % 2)
            self.assertEqual(data['recoveredY'], data['Q']['y'])
            count = 0
            for row in data['multiplication']:
                self.assertEqual(row['before'], None if count == 0 else self.coords(count))
                self.assertEqual(row['doubled'], None if count == 0 else self.coords(count*2))
                count = 2*count + int(row['bit'])
                self.assertEqual(row['result'], self.coords(count))
            self.assertEqual(count, d)
            self.assertEqual(data['multiplication'][-1]['result'], data['Q'])

    @staticmethod
    def coords(count):
        P = count * SECP256k1.generator
        return dict(x=f'{P.x():064x}', y=f'{P.y():064x}')

    def test_deterministic_signature_digest_and_independent_der_verification(self):
        data = trace(request())
        self.assertEqual(data, trace(request()))
        self.assertEqual(data['digest'], hashlib.sha256(data['message'].encode()).hexdigest())
        vk = VerifyingKey.from_string(bytes.fromhex(data['compressed']), curve=SECP256k1)
        self.assertTrue(vk.verify_digest(bytes.fromhex(data['der']), bytes.fromhex(data['digest']), sigdecode=sigdecode_der))
        r, s = sigdecode_der(bytes.fromhex(data['der']), SECP256k1.order)
        self.assertEqual(r, int(data['r'], 16))
        self.assertEqual(s, min(int(data['s'], 16), SECP256k1.order - int(data['s'], 16)))
        self.assertLessEqual(s, SECP256k1.order // 2)
        self.assertTrue(data['verification']['valid'])
        self.assertEqual(data['verification']['V'], data['R'])
        with self.assertRaises(BadSignatureError):
            vk.verify_digest(bytes.fromhex(data['der']), hashlib.sha256(b'different').digest(), sigdecode=sigdecode_der)

    def test_mutation_experiments_keep_original_signature_and_fail_verification(self):
        base = trace(request())
        for experiment in ('message', 'key', 'signature'):
            data = trace(request(experiment=experiment))
            for field in ('r', 's', 'k', 'Q', 'message', 'digest'):
                self.assertEqual(data[field], base[field])
            self.assertFalse(data['verification']['valid'])
        changed = trace(request(message='Another digest'))
        self.assertNotEqual(changed['k'], base['k'])
        self.assertEqual(trace(request(SECP256k1.order - 1, 'key'))['verification']['Q'], trace(request(1))['Q'])

    def test_range_input_validation_and_no_stdout_from_adapter(self):
        for d in (0, SECP256k1.order, 2**256 - 1):
            with self.assertRaisesRegex(ValueError, '1 ≤ d < n'):
                trace(request(d))
        for value in ('a', 'gg' * 32, None, '  ' * 32):
            req = request()
            req['cryptography']['privateHex'] = value
            with self.assertRaisesRegex(ValueError, '64 hexadecimal'):
                trace(req)
        with self.assertRaisesRegex(ValueError, '512 UTF-8 bytes'):
            trace(request(message='₿' * 171))
        with self.assertRaisesRegex(ValueError, 'verification experiment'):
            trace(request(experiment='unexpected'))
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            trace(request())
        self.assertEqual(stdout.getvalue(), '')

    def test_displayed_python_replays_all_results(self):
        for experiment in ('original', 'message', 'key', 'signature'):
            data = trace(request(experiment=experiment, message="quotes ' and newlines\n₿"))
            namespace, stdout = {}, io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exec(data['python'], namespace)
            expected = {k: v for k, v in data.items() if k != 'python'}
            self.assertEqual(json.loads(stdout.getvalue()), expected)
            self.assertEqual(namespace['result'], expected)

    def test_key_lesson_code_stays_with_the_terms_already_introduced(self):
        for page in ('private-keys', 'public-keys'):
            data = trace(request(page=page))
            self.assertNotIn('verification', data)
            self.assertNotIn('generate_k', data['python'])
            self.assertNotIn('sign_digest', data['python'])
            if page == 'private-keys':
                self.assertNotIn('Q', data)
                self.assertNotIn('get_public_key', data['python'])
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                exec(data['python'], {})
            self.assertEqual(json.loads(stdout.getvalue()), {k: v for k, v in data.items() if k != 'python'})
            self.assertEqual(trace(request(page=page, message='₿' * 513)), data)


if __name__ == '__main__':
    unittest.main()
