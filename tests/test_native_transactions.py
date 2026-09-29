"""Independent BIP143 digests and witness wire-format checks for the native lab."""
import contextlib
import copy
import io
import struct
import unittest

from test_transactions import trace
from test_signing import double_sha
from bitcoinutils.keys import PrivateKey
from bitcoinutils.setup import setup
from bitcoinutils.script import Script
from ecdsa import SECP256k1, VerifyingKey
from ecdsa.util import sigdecode_der


def request(network='mainnet', multiple=False):
    setup(network)
    addresses = [PrivateKey(secret_exponent=n).get_public_key().get_segwit_address().to_string() for n in (1, 2)]
    inputs = [dict(txid='0123456789abcdef' * 4, vout='0', amount='100000', sourceType='address',
                   source=addresses[0], privateKey='0' * 63 + '1', compressed=True)]
    if multiple:
        inputs.append(dict(txid='ab' * 32, vout='258', amount='50000', sourceType='script',
                           source='001406afd46bcdfd22ef94ac122aa11f241244a37ecc', privateKey='0' * 63 + '2', compressed=True))
    return dict(kind='transaction', network=network, signTransaction=True, transaction=dict(spendType='p2wpkh', inputs=inputs,
        outputs=[dict(address=addresses[1], amount='60000'), dict(address=addresses[0], amount='39000')]))


def wasm_vectors():
    requests = [request(n, multiple=m) for n in ('mainnet', 'testnet') for m in (False, True)]
    for mode in (1, 2, 3, 129, 130, 131):
        req = request(multiple=True)
        req['transaction']['inputs'][1]['sighashType'] = mode
        requests.extend([req, {**req, 'previewSighash': True}])
    requests.append({**request(), 'signTransaction': False})
    return [dict(input=req, trace=trace(req)) for req in requests]


def parse_wire(raw):
    # Fixtures have <253 inputs/outputs/items and item/script lengths <253, so
    # CompactSize is one byte. This parser deliberately does not use the adapter offsets.
    pos = 4
    witness = raw[pos:pos + 2] == b'\x00\x01'
    if witness:
        pos += 2
    start = pos
    count = raw[pos]
    pos += 1
    scripts = []
    for _ in range(count):
        pos += 36
        size = raw[pos]
        pos += 1
        scripts.append(raw[pos:pos + size])
        pos += size + 4
    output_count = raw[pos]
    pos += 1
    outputs = []
    for _ in range(output_count):
        begin = pos
        size = raw[pos + 8]
        pos += 9 + size
        outputs.append(raw[begin:pos])
    base = raw[:4] + raw[start:pos] + raw[-4:]
    witnesses = []
    if witness:
        for _ in range(count):
            n = raw[pos]
            pos += 1
            items = []
            for _ in range(n):
                size = raw[pos]
                pos += 1
                items.append(raw[pos:pos + size])
                pos += size
            witnesses.append(items)
    assert pos == len(raw) - 4
    return base, scripts, outputs, witnesses


def independent_digest(req, raw, index, mode):
    rows = req['transaction']['inputs']
    _, _, outputs, _ = parse_wire(raw)
    base, anyone = mode & 31, bool(mode & 128)
    outpoints = [bytes.fromhex(row['txid'])[::-1] + struct.pack('<I', int(row['vout'])) for row in rows]
    prevouts = bytes(32) if anyone else double_sha(b''.join(outpoints))
    sequence = bytes(32) if anyone or base in (2, 3) else double_sha(b'\xff' * (4 * len(rows)))
    hash_outputs = double_sha(b''.join(outputs)) if base == 1 else double_sha(outputs[index]) if base == 3 and index < len(outputs) else bytes(32)
    pubkey = bytes.fromhex(PrivateKey.from_bytes(bytes.fromhex(rows[index]['privateKey'])).get_public_key().to_hex(compressed=True))
    # Derive scriptCode independently of the adapter's previousScripts/scriptCodes.
    import hashlib
    key_hash = hashlib.new('ripemd160', hashlib.sha256(pubkey).digest()).digest()
    script_code = b'\x19\x76\xa9\x14' + key_hash + b'\x88\xac'
    preimage = (struct.pack('<I', 2) + prevouts + sequence + outpoints[index] + script_code
                + struct.pack('<Q', int(rows[index]['amount'])) + b'\xff' * 4 + hash_outputs + struct.pack('<II', 0, mode))
    return double_sha(preimage)


class NativeTransactionsTests(unittest.TestCase):
    def test_unsigned_base_and_signed_witness_layout_ids_and_sizes(self):
        for network in ('mainnet', 'testnet'):
            for multiple in (False, True):
                req = request(network, multiple)
                unsigned = trace({**req, 'signTransaction': False})
                result = trace(req)
                data = result['transaction']
                raw = bytes.fromhex(result['steps'][0]['hex'])
                stripped, scripts, outputs, witnesses = parse_wire(raw)
                self.assertEqual(raw[4:6], b'\x00\x01')
                self.assertTrue(all(script == b'' for script in scripts))
                self.assertEqual(stripped.hex(), unsigned['steps'][0]['hex'])
                self.assertEqual(data['txid'], double_sha(stripped)[::-1].hex())
                self.assertEqual(data['wtxid'], double_sha(raw)[::-1].hex())
                self.assertEqual(data['txid'], unsigned['transaction']['txid'])
                self.assertNotEqual(data['txid'], data['wtxid'])
                self.assertEqual(data['baseSize'], len(stripped))
                self.assertEqual(data['totalSize'], len(raw))
                self.assertEqual(data['weight'], len(stripped) * 3 + len(raw))
                self.assertEqual(data['vsize'], (len(stripped) * 3 + len(raw) + 3) // 4)
                self.assertEqual(unsigned['transaction']['txid'], unsigned['transaction']['wtxid'])
                for item, stack in zip(data['signing']['inputs'], witnesses):
                    self.assertEqual(stack, [bytes.fromhex(item['signature']), bytes.fromhex(item['publicKey'])])
                    self.assertEqual(item['scriptSig'], '')
                self.assertEqual([part[8:11].hex() for part in outputs], ['160014', '160014'])
                offset = 0
                for field in data['fields']:
                    self.assertEqual(field['start'], offset)
                    offset = field['end']
                self.assertEqual(offset, len(raw))
                with contextlib.redirect_stdout(io.StringIO()) as stdout:
                    exec(data['python'], {})
                self.assertEqual(stdout.getvalue().strip(), raw.hex())

    def test_all_six_modes_match_independent_digest_and_ecdsa(self):
        for index in (0, 1):
            for mode in (1, 2, 3, 129, 130, 131):
                with self.subTest(index=index, mode=mode):
                    req = request(multiple=True)
                    req['transaction']['inputs'][index]['sighashType'] = mode
                    result = trace(req)
                    item = result['transaction']['signing']['inputs'][index]
                    digest = independent_digest(req, bytes.fromhex(result['steps'][0]['hex']), index, mode)
                    self.assertEqual(item['digest'], digest.hex())
                    signature = bytes.fromhex(item['signature'])
                    self.assertEqual(signature[-1], mode)
                    key = VerifyingKey.from_string(bytes.fromhex(item['publicKey']), curve=SECP256k1)
                    self.assertTrue(key.verify_digest(signature[:-1], digest, sigdecode=sigdecode_der))
                    preview_req = copy.deepcopy(req)
                    for row in preview_req['transaction']['inputs']:
                        row.pop('privateKey')
                    preview = trace({**preview_req, 'previewSighash': True})['sighash']['inputs'][index]
                    self.assertEqual(preview['digest'], digest.hex())
                    self.assertIsNone(preview['preimage'])
                    self.assertEqual(preview['algorithm'], 'BIP143')

    def test_single_without_corresponding_output_uses_zero_hash_outputs(self):
        for mode in (3, 131):
            req = request(multiple=True)
            req['transaction']['outputs'].pop()
            req['transaction']['inputs'][1]['sighashType'] = mode
            result = trace(req)
            digest = independent_digest(req, bytes.fromhex(result['steps'][0]['hex']), 1, mode)
            self.assertEqual(result['transaction']['signing']['inputs'][1]['digest'], digest.hex())
            self.assertNotEqual(digest, b'\x01' + bytes(31))
            preview = trace({**req, 'previewSighash': True})['sighash']['inputs'][1]
            self.assertEqual(preview['outputScope'], 'No outputs · hashOutputs is zero')

    def test_current_amount_committed_in_every_mode_but_other_amount_not_committed(self):
        for mode in (1, 2, 3, 129, 130, 131):
            req = request(multiple=True)
            req['transaction']['inputs'][0]['sighashType'] = mode
            before = trace(req)['transaction']
            req['transaction']['inputs'][0]['amount'] = '100001'
            after = trace(req)['transaction']
            self.assertEqual(before['txid'], after['txid'])
            self.assertNotEqual(before['wtxid'], after['wtxid'])
            self.assertNotEqual(before['signing']['inputs'][0]['digest'], after['signing']['inputs'][0]['digest'])
            self.assertEqual(before['signing']['inputs'][1]['digest'], after['signing']['inputs'][1]['digest'])

    def test_reject_mismatched_locks_networks_and_uncompressed_keys(self):
        for update in (dict(source='bad'), dict(source='1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'),
                       dict(source=request('testnet')['transaction']['inputs'][0]['source']),
                       dict(sourceType='script', source='0020' + '11' * 32),
                       dict(sourceType='script', source='0014' + '22' * 20),
                       dict(privateKey='0' * 63 + '2'), dict(compressed=False)):
            req = request()
            req['transaction']['inputs'][0].update(update)
            with self.subTest(update=update), self.assertRaises(ValueError):
                trace(req)
        req = request()
        from bitcoinutils.keys import P2wshAddress
        req['transaction']['outputs'][0]['address'] = P2wshAddress(script=Script(['OP_TRUE'])).to_string()
        with self.assertRaises(ValueError):
            trace(req)

    def test_native_bytes_cannot_enter_legacy_only_candidate_builder(self):
        result = trace(request())
        with self.assertRaisesRegex(ValueError, 'legacy transactions only'):
            trace(dict(kind='construction', candidate=dict(hex=result['steps'][0]['hex'], fee=1000)))
