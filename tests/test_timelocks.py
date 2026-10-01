"""Independent boundary, wire, replay, and signature tests for timelock templates."""
import contextlib
import copy
import hashlib
import io
import json
import unittest
from python_test_support import adapter
from bitcoinutils.keys import PrivateKey
from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction
from ecdsa import BadSignatureError, SECP256k1, VerifyingKey
from ecdsa.util import sigdecode_der
from test_native_transactions import parse_wire


def request(mode='cltv', unit=None, network='mainnet', **updates):
    relative = mode in ('sequence', 'csv')
    unit = unit or ('blocks' if relative else 'height')
    value = 169 if relative and unit == 'time' else 144 if relative else 1760000000 if unit == 'time' else 900000
    options = dict(mode=mode, unit=unit, value=str(value), version='2', locktime='0' if relative else str(value),
                   sequence=str(value | (1 << 22 if unit == 'time' else 0)) if relative else '4294967294',
                   height='900000', mtp='1760000000', coinHeight='899900', coinMtp='1759914000')
    options.update({key: str(v) for key, v in updates.items()})
    return dict(kind='timelocks', network=network, timelocks=options)


def trace(req):
    return json.loads(adapter.trace_lesson(json.dumps(req)))['timelocks']


def wasm_vectors():
    requests = [request(mode, unit, network) for mode in ('locktime', 'sequence', 'cltv', 'csv')
                for unit in (('blocks', 'time') if mode in ('sequence', 'csv') else ('height', 'time'))
                for network in ('mainnet', 'testnet')]
    requests.extend([request('cltv', height=900001), request('cltv', sequence=4294967295),
                     request('cltv', locktime=899999), request('csv', height=900044),
                     request('csv', version=1), request('csv', sequence=143),
                     request('csv', sequence=4194448), request('csv', 'time', mtp=1760000528)])
    return [dict(input=req, trace=json.loads(adapter.trace_lesson(json.dumps(req)))) for req in requests]


class TimelockTests(unittest.TestCase):
    def test_absolute_height_and_timestamp_equality_are_too_early(self):
        for mode in ('locktime', 'cltv'):
            for unit, key, boundary in [('height', 'height', 900000), ('time', 'mtp', 1760000000)]:
                for offset, passed in [(-1, False), (0, False), (1, True)]:
                    data = trace(request(mode, unit, **{key: boundary + offset}))
                    self.assertTrue(data['scriptPass'])
                    self.assertEqual(data['chainPass'], passed)
                    self.assertEqual(data['eligible'], passed)

    def test_relative_height_and_mtp_equal_first_valid_boundary(self):
        for mode in ('sequence', 'csv'):
            for unit, key, boundary in [('blocks', 'height', 900044), ('time', 'mtp', 1760000528)]:
                for offset, passed in [(-1, False), (0, True), (1, True)]:
                    data = trace(request(mode, unit, **{key: boundary + offset}))
                    self.assertTrue(data['scriptPass'])
                    self.assertEqual(data['chainPass'], passed)
                self.assertEqual(trace(request(mode, unit))['effectiveDelay'], 86528 if unit == 'time' else 144)

    def test_cltv_fields_cannot_be_fixed_by_waiting(self):
        for updates in [dict(locktime=899999), dict(locktime=1760000000), dict(sequence=4294967295)]:
            data = trace(request('cltv', height=950000, mtp=1800000000, **updates))
            self.assertFalse(data['scriptPass']); self.assertFalse(data['eligible'])
        self.assertTrue(trace(request('cltv', height=900001, version=1))['eligible'])
        self.assertTrue(trace(request('cltv', height=900010, locktime=900005))['eligible'])

    def test_final_sequence_bypasses_transaction_lock_but_rejects_cltv(self):
        self.assertTrue(trace(request('locktime', sequence=4294967295))['eligible'])
        self.assertFalse(trace(request('cltv', sequence=4294967295))['scriptPass'])
        for seq in (4294967294, 4294967293):
            data = trace(request('locktime', sequence=seq)); self.assertFalse(data['chainPass'])
            self.assertFalse(data['relativeActive']); self.assertTrue(data['absoluteActive'])

    def test_csv_requires_version_disable_unit_and_masked_minimum(self):
        for updates in [dict(version=1), dict(sequence=2147483792), dict(sequence=4194448), dict(sequence=143)]:
            data = trace(request('csv', height=950000, mtp=1800000000, **updates))
            self.assertFalse(data['scriptPass']); self.assertFalse(data['eligible'])
        # Reserved bits do not participate in CSV comparison or BIP68 duration.
        data = trace(request('csv', sequence=(1 << 25) + 144, height=900044))
        self.assertTrue(data['eligible']); self.assertEqual(data['masked'], 144)
        self.assertTrue(trace(request('csv', sequence=145, height=900045))['eligible'])
        self.assertFalse(trace(request('csv', sequence=145, height=900044))['chainPass'])

    def test_sequence_version_and_disable_bypasses_do_not_require_an_opcode(self):
        for updates in [dict(version=1), dict(sequence=2147483792)]:
            self.assertTrue(trace(request('sequence', **updates))['eligible'])
        self.assertTrue(trace(request('locktime', locktime=0))['eligible'])
        # Both absolute and relative constraints can be active, independently.
        self.assertFalse(trace(request('csv', locktime=900050, height=900044))['chainPass'])
        self.assertTrue(trace(request('csv', locktime=900050, height=900051))['eligible'])

    def test_zero_maximum_delay_and_threshold_type_switch(self):
        self.assertTrue(trace(request('csv', value=0, sequence=0))['eligible'])
        for unit, seq, height, mtp in [('blocks',65535,965435,1760000000), ('time',4259839,900000,1793467920)]:
            self.assertTrue(trace(request('csv', unit, value=65535, sequence=seq, height=height, mtp=mtp))['eligible'])
        self.assertTrue(trace(request('cltv','time',value=500000000,locktime=500000000))['scriptPass'])
        self.assertFalse(trace(request('cltv','height',value=499999999,locktime=500000000))['scriptPass'])

    def test_signed_bytes_replay_and_independent_wire_accounting(self):
        for mode in ('locktime', 'sequence', 'cltv', 'csv'):
            for unit in (('blocks', 'time') if mode in ('sequence', 'csv') else ('height', 'time')):
                for network in ('mainnet','testnet'):
                    req = request(mode,unit,network); data = trace(req); raw = bytes.fromhex(data['hex'])
                    base, scripts, outputs, witness = parse_wire(raw)
                    self.assertEqual(scripts, [b''])
                    self.assertEqual(witness, [[bytes.fromhex(data['signature']),bytes.fromhex(data['script'])]])
                    self.assertEqual(raw[:4], int(req['timelocks']['version']).to_bytes(4,'little'))
                    self.assertEqual(raw[-4:].hex(),data['locktimeHex'])
                    self.assertEqual(raw[44:48].hex(),data['sequenceHex'])
                    self.assertEqual((len(base)*3+len(raw)+3)//4,data['vsize'])
                    sha = lambda v: hashlib.sha256(hashlib.sha256(v).digest()).digest()[::-1].hex()
                    self.assertEqual(data['txid'],sha(base)); self.assertEqual(data['wtxid'],sha(raw))
                    self.assertEqual(data['previousScript'], '0020'+hashlib.sha256(bytes.fromhex(data['script'])).hexdigest())
                    self.assertEqual(int.from_bytes(outputs[0][:8],'little'),99000)
                    with contextlib.redirect_stdout(io.StringIO()) as out: exec(data['python'],{})
                    self.assertEqual(out.getvalue().strip(),data['hex'])

    def test_clock_changes_preserve_bytes_but_fields_or_output_rules_change_signatures(self):
        req = request(); original = copy.deepcopy(req); first = trace(req)
        self.assertEqual(req, original)
        later = trace(request(height=900001, mtp=1760001000))
        self.assertEqual(first['hex'],later['hex']); self.assertNotEqual(first['eligible'],later['eligible'])
        other = trace(request(locktime=900001))
        self.assertNotEqual(first['digest'],other['digest']); self.assertNotEqual(first['signature'],other['signature'])
        vk = VerifyingKey.from_string(bytes.fromhex(PrivateKey(secret_exponent=1).get_public_key().to_hex()),curve=SECP256k1)
        with self.assertRaises(BadSignatureError): vk.verify_digest(bytes.fromhex(first['signature'])[:-1],bytes.fromhex(other['digest']),sigdecode=sigdecode_der)
        self.assertNotEqual(first['address'],trace(request(value=900001))['address'])
        self.assertEqual(trace(request('locktime'))['address'],trace(request('locktime',value=900001,locktime=900001))['address'])

    def test_invalid_values_and_unconfirmed_context_are_rejected(self):
        for key, values in [('value',['-1','1.5','NaN',True]),('sequence',['4294967296',None]),
                            ('height',['899900','899899']),('coinMtp',['1760000001']),('version',['0','3'])]:
            for value in values:
                req=request(); req['timelocks'][key]=value
                with self.assertRaises(ValueError): trace(req)
        with self.assertRaises(ValueError): trace(request('csv',value=65536))
        with self.assertRaises(ValueError): trace(request('cltv','height',value=500000000))
        with self.assertRaises(ValueError): trace(request('cltv','time',value=499999999))
        with self.assertRaises(ValueError): trace(request(network='signet'))
