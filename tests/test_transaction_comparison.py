"""Independent wire accounting, signature execution and ID checks for fair comparisons."""
import contextlib
import copy
import hashlib
import io
import json
import unittest
from python_test_support import adapter


def request(group='single', inputs=1, outputs=2, network='mainnet'):
    return dict(kind='tx-compare', network=network, transactionComparison=dict(group=group, inputs=inputs, outputs=outputs))


def trace(req):
    return json.loads(adapter.trace_lesson(json.dumps(req)))


def wire(raw):
    """Parse CompactSize independently, including large P2SH scriptSig lengths."""
    pos = 4
    witness = raw[4:6] == b'\x00\x01'
    if witness:
        pos = 6
    start = pos
    def size():
        nonlocal pos
        n = raw[pos]; pos += 1
        if n >= 253:
            length = {253: 2, 254: 4, 255: 8}[n]
            n = int.from_bytes(raw[pos:pos + length], 'little'); pos += length
        return n
    count = size()
    sigs = []
    for _ in range(count):
        pos += 36
        length = size(); sigs.append(raw[pos:pos + length]); pos += length + 4
    outputs = []
    for _ in range(size()):
        begin = pos
        pos += 8
        length = size(); pos += length
        outputs.append(raw[begin:pos])
    base = raw[:4] + raw[start:pos] + raw[-4:]
    if witness:
        for _ in range(count):
            for _ in range(size()):
                length = size(); pos += length
    assert pos + 4 == len(raw)
    return base, sigs, outputs


def digest(raw):
    return hashlib.sha256(hashlib.sha256(raw).digest()).digest()[::-1].hex()


def wasm_vectors():
    return [dict(input=req, trace=trace(req)) for req in [request(group, count, outputs, network)
        for group in ('single', 'multisig') for count, outputs, network in ((1, 2, 'mainnet'), (2, 1, 'testnet'))]]


class TransactionComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vectors = wasm_vectors()
        cls.vectors.extend(dict(input=req, trace=trace(req)) for req in [request(g, 5) for g in ('single', 'multisig')])

    def test_identical_outputs_outpoints_balance_and_exact_wire_metrics(self):
        for vector in self.vectors:
            data = vector['trace']['transactionComparison']
            common_outputs = None
            for row in data['rows']:
                raw = bytes.fromhex(row['hex'])
                base, sigs, outputs = wire(raw)
                if common_outputs is None:
                    common_outputs = outputs
                self.assertEqual(outputs, common_outputs)
                self.assertEqual(len(sigs), data['inputs'])
                self.assertEqual(len(outputs), data['outputs'])
                self.assertEqual(row['baseSize'], len(base))
                self.assertEqual(row['totalSize'], len(raw))
                self.assertEqual(row['scriptSigBytes'], sum(map(len, sigs)))
                self.assertEqual(row['witnessBytes'], len(raw) - len(base))
                self.assertEqual(row['weight'], len(base) * 3 + len(raw))
                self.assertEqual(row['vsize'], (row['weight'] + 3) // 4)
                self.assertEqual(row['txid'], digest(base))
                self.assertEqual(row['wtxid'], digest(raw))
            self.assertEqual(data['totalInput'] - data['payment'] - data['change'], 1000)
            self.assertTrue(all(s.startswith('0014') and len(s) == 44 for s in data['outputScripts']))

    def test_every_signed_spending_condition_executes(self):
        for vector in self.vectors:
            data = vector['trace']['transactionComparison']
            for row in data['rows']:
                for index in range(data['inputs']):
                    options = dict(hex=row['hex'], previousScript=row['inputLock'], inputIndex=index,
                                   experiment='original', spendType=row['type'], amount=100000,
                                   previousScripts=[row['inputLock']] * data['inputs'], amounts=[100000] * data['inputs'])
                    result = json.loads(adapter.trace_lesson(json.dumps(dict(kind='execution', network=vector['input']['network'], execution=options))))
                    self.assertTrue(result['execution']['success'], (row['type'], index, result['execution']['error']))

    def test_signature_edit_ids_are_independently_hashed(self):
        for vector in self.vectors:
            for row in vector['trace']['transactionComparison']['rows']:
                mutation = row['mutation']
                raw = bytearray.fromhex(row['hex']); raw[mutation['byteOffset']] ^= 1
                base, _, _ = wire(raw)
                self.assertEqual(mutation['txid'], digest(base))
                self.assertEqual(mutation['wtxid'], digest(raw))
                self.assertNotEqual(row['wtxid'], mutation['wtxid'])
                self.assertEqual(row['txid'] == mutation['txid'], row['hasWitness'])

    def test_python_reproduces_signed_bytes_with_common_outputs(self):
        for i in (0, 2):
            for row in self.vectors[i]['trace']['transactionComparison']['rows']:
                with contextlib.redirect_stdout(io.StringIO()) as out:
                    exec(row['python'], {})
                self.assertEqual(out.getvalue().strip(), row['hex'])

    def test_group_keys_and_baselines(self):
        single = self.vectors[0]['trace']['transactionComparison']['rows']
        multi = self.vectors[2]['trace']['transactionComparison']['rows']
        self.assertEqual([r['type'] for r in single], ['p2pkh','p2wpkh','nested','p2tr'])
        self.assertEqual([r['type'] for r in multi], ['p2sh','p2wsh','p2tr-script'])
        self.assertLess(single[3]['vsize'], single[1]['vsize'])
        self.assertLess(single[1]['vsize'], single[2]['vsize'])
        self.assertLess(single[2]['vsize'], single[0]['vsize'])
        self.assertGreater(single[1]['totalSize'], single[0]['totalSize'])
        self.assertLess(multi[1]['vsize'], multi[2]['vsize']) # Recovery proof has a cost.
        self.assertEqual(multi[0]['input']['redeemScript'], multi[1]['input']['witnessScript'])
        self.assertEqual(multi[2]['input']['sighashType'], 0)

    def test_validation_and_nonmutation(self):
        for option, values in [('inputs', [True, 0, 3, 20, '1']), ('outputs', [False, 0, 3, '2']), ('group', ['all', None])]:
            for value in values:
                req = request(); req['transactionComparison'][option] = value
                with self.assertRaises(ValueError): trace(req)
        with self.assertRaises(ValueError): trace(request(network='signet'))
        req = request(); original = copy.deepcopy(req); trace(req)
        self.assertEqual(req, original)
