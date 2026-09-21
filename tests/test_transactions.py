import copy
import contextlib
import io
import json
import unittest

from test_p2pkh import adapter


def request(network='mainnet'):
    addresses = {
        'mainnet': ['1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH', '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'],
        'testnet': ['mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r', 'mg8Jz5776UdyiYcBb9Z873NTozEiADRW5H'],
    }[network]
    return dict(kind='transaction', network=network, transaction=dict(
        inputs=[dict(txid='0123456789abcdef' * 4, vout='0', amount='100000', sourceType='address', source=addresses[0])],
        outputs=[dict(address=addresses[1], amount='60000'), dict(address=addresses[0], amount='39000')]))


def trace(req):
    return json.loads(adapter.trace_lesson(json.dumps(req)))


def wasm_vectors():
    requests = [request(n) for n in ['mainnet', 'testnet']]
    custom = request()
    custom['transaction']['inputs'][0].update(sourceType='script', source='76a914' + '11' * 20 + '88ac', vout='4294967295')
    custom['transaction']['inputs'].append(dict(custom['transaction']['inputs'][0], txid='ab' * 32, amount='210000000000000'))
    requests.append(custom)
    return [dict(input=req, trace=trace(req)) for req in requests]


class TransactionTests(unittest.TestCase):
    def test_exact_unsigned_wire_bytes(self):
        result = trace(request())
        # Independent layout: v2, one empty-script input, two 25-byte P2PKH outputs, locktime 0.
        expected = ('0200000001' + 'efcdab8967452301' * 4 + '0000000000ffffffff02'
                    '60ea0000000000001976a91406afd46bcdfd22ef94ac122aa11f241244a37ecc88ac'
                    '58980000000000001976a914751e76e8199196d454941c45d1b3a323f1433bd688ac00000000')
        self.assertEqual(result['steps'][0]['hex'], expected)
        self.assertEqual(result['steps'][0]['byteLength'], 119)
        self.assertEqual(result['transaction']['fee'], 1000)
        self.assertEqual(trace(request('testnet'))['steps'][0]['hex'], expected)

    def test_annotations_cover_bytes_and_python_replays(self):
        for vector in wasm_vectors():
            result = vector['trace']
            raw = result['steps'][0]['hex']
            offset = 0
            for field in result['transaction']['fields']:
                self.assertEqual(field['start'], offset)
                self.assertGreaterEqual(field['end'], offset)
                offset = field['end']
                if 'empty scriptSig' in field['label']:
                    self.assertEqual(field['start'], field['end'])
            self.assertEqual(offset * 2, len(raw))
            namespace = {}
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                exec(result['transaction']['python'], namespace)
            self.assertEqual(stdout.getvalue().strip(), raw)

    def test_metadata_not_serialized_and_fee_uses_integers(self):
        req = request()
        before = trace(req)
        req['transaction']['inputs'][0].update(amount='100001', sourceType='script', source='76a914' + 'aa' * 20 + '88ac')
        after = trace(req)
        self.assertEqual(before['steps'][0]['hex'], after['steps'][0]['hex'])
        self.assertEqual(after['transaction']['fee'], 1001)
        self.assertEqual(after['transaction']['previousScripts'], ['76a914' + 'aa' * 20 + '88ac'])

    def test_multiple_inputs_and_output_indices(self):
        result = wasm_vectors()[-1]['trace']
        raw = bytes.fromhex(result['steps'][0]['hex'])
        self.assertEqual(raw[4], 2)
        self.assertEqual(int.from_bytes(raw[37:41], 'little'), 0xffffffff)
        self.assertEqual(raw[46:78], bytes.fromhex('ab' * 32))
        self.assertEqual(raw[87], 2)
        self.assertEqual(len(raw), 160)

    def test_invalid_utxos(self):
        for updates in [dict(txid='00' * 32), dict(txid='ff'), dict(txid='zz' * 32),
                        dict(vout='-1'), dict(vout='4294967296'), dict(vout=True),
                        dict(amount='1.1'), dict(amount='1e5'), dict(amount='0'),
                        dict(amount='2100000000000001'), dict(source='bad'),
                        dict(source='mrCDrCybB6J1vRfbwM5hemdJz73FwDBC8r'),
                        dict(sourceType='script', source='0014' + '11' * 20),
                        dict(sourceType='script', source='76a914' + 'gg' * 20 + '88ac')]:
            with self.subTest(updates=updates):
                req = request()
                req['transaction']['inputs'][0].update(updates)
                with self.assertRaises(ValueError):
                    trace(req)

    def test_invalid_balance_outputs_and_duplicates(self):
        for update in [dict(amount='100001'), dict(amount='-1'), dict(amount='1.5'),
                       dict(address='3JvL6Ymt8MVWiCNHC7oWU6nLeHNJKLZGLN'),
                       dict(address='1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMJ')]:
            req = request()
            req['transaction']['outputs'][0].update(update)
            with self.assertRaises(ValueError):
                trace(req)
        req = request()
        req['transaction']['inputs'].append(copy.deepcopy(req['transaction']['inputs'][0]))
        with self.assertRaisesRegex(ValueError, 'distinct UTXO'):
            trace(req)
        for key in ['inputs', 'outputs']:
            for size in [0, 21]:
                req = request()
                req['transaction'][key] = req['transaction'][key][:1] * size
                with self.assertRaises(ValueError):
                    trace(req)

    def test_zero_fee_zero_output_and_maximum_money(self):
        req = request()
        req['transaction']['outputs'][0]['amount'] = '61000'
        self.assertEqual(trace(req)['transaction']['fee'], 0)
        req['transaction']['inputs'][0]['amount'] = '2100000000000000'
        req['transaction']['outputs'][0]['amount'] = '2100000000000000'
        req['transaction']['outputs'][1]['amount'] = '0'
        self.assertEqual(trace(req)['transaction']['fee'], 0)
        req['transaction']['outputs'][1]['amount'] = '1'
        with self.assertRaises(ValueError):
            trace(req)


if __name__ == '__main__':
    unittest.main()
