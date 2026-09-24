"""Independent legacy SIGHASH_ALL layout and ECDSA verification of library output."""
import contextlib
import copy
import hashlib
import io
import struct
import unittest

from test_transactions import request, trace
from bitcoinutils.keys import PrivateKey
from bitcoinutils.setup import setup
from ecdsa import BadSignatureError, SECP256k1, VerifyingKey
from ecdsa.util import sigdecode_der


def signed_request(network='mainnet', compressed=True):
    req = request(network)
    req['signTransaction'] = True
    setup(network)
    req['transaction']['inputs'][0].update(privateKey='0' * 63 + '1', compressed=compressed,
        source=PrivateKey(secret_exponent=1).get_public_key().get_address(compressed=compressed).to_string())
    return req


def vectors():
    requests = [signed_request(n, c) for n in ['mainnet', 'testnet'] for c in [True, False]]
    multiple = signed_request()
    setup('mainnet')
    multiple['transaction']['inputs'].append(dict(txid='ab' * 32, vout='258', amount='50000',
        sourceType='script', source=PrivateKey(secret_exponent=2).get_public_key().get_address().to_script_pub_key().to_hex(),
        privateKey='0' * 63 + '2', compressed=True))
    requests.append(multiple)
    return [dict(input=req, trace=trace(req)) for req in requests]


def double_sha(raw):
    return hashlib.sha256(hashlib.sha256(raw).digest()).digest()


def digest_independently(req, result, index):
    # No library transaction/digest/serialization calls: fixed v2/final/locktime-0
    # SIGHASH_ALL preimage for this lesson's <=20 inputs/outputs and 25-byte scripts.
    rows = req['transaction']['inputs']
    raw = struct.pack('<iB', 2, len(rows))
    for i, row in enumerate(rows):
        script = bytes.fromhex(result['transaction']['previousScripts'][i]) if i == index else b''
        raw += bytes.fromhex(row['txid'])[::-1] + struct.pack('<IB', int(row['vout']), len(script)) + script + b'\xff' * 4
    raw += bytes([len(req['transaction']['outputs'])])
    output_scripts = [field for field in result['transaction']['fields'] if field['label'].startswith('Output ') and field['label'].endswith('locking script')]
    serialized = bytes.fromhex(result['steps'][0]['hex'])
    for row, field in zip(req['transaction']['outputs'], output_scripts):
        script = serialized[field['start']:field['end']]
        raw += struct.pack('<QB', int(row['amount']), len(script)) + script
    raw += struct.pack('<II', 0, 1)
    return double_sha(raw)


def sighash_preimage_independently(req, result, index, mode):
    # Independent wire layout for the educational fixed v2/final/locktime-0 transaction.
    rows = req['transaction']['inputs']
    output_rows = req['transaction']['outputs']
    signed_hex = bytes.fromhex(result['steps'][0]['hex'])
    output_fields = [field for field in result['transaction']['fields']
                     if field['label'].startswith('Output ') and field['label'].endswith('locking script')]
    base, anyone = mode & 31, bool(mode & 128)
    included = [index] if anyone else range(len(rows))
    raw = struct.pack('<iB', 2, len(included))
    for i in included:
        row = rows[i]
        script = bytes.fromhex(result['transaction']['previousScripts'][i]) if i == index else b''
        sequence = b'\xff' * 4 if base == 1 or i == index else b'\x00' * 4
        raw += bytes.fromhex(row['txid'])[::-1] + struct.pack('<IB', int(row['vout']), len(script)) + script + sequence
    selected_outputs = range(len(output_rows)) if base == 1 else [] if base == 2 else range(index + 1)
    raw += bytes([len(selected_outputs)])
    for i in selected_outputs:
        if base == 3 and i < index:
            raw += b'\xff' * 8 + b'\x00'
        else:
            field = output_fields[i]
            script = signed_hex[field['start']:field['end']]
            raw += struct.pack('<QB', int(output_rows[i]['amount']), len(script)) + script
    return raw + struct.pack('<II', 0, mode)


class SigningTests(unittest.TestCase):
    def test_independent_digest_and_ecdsa_verification(self):
        for vector in vectors():
            result, req = vector['trace'], vector['input']
            for i, item in enumerate(result['transaction']['signing']['inputs']):
                digest = digest_independently(req, result, i)
                self.assertEqual(digest.hex(), item['digest'])
                signature = bytes.fromhex(item['signature'])
                self.assertEqual(signature[-1], 1)
                verifier = VerifyingKey.from_string(bytes.fromhex(item['publicKey']), curve=SECP256k1)
                self.assertTrue(verifier.verify_digest(signature[:-1], digest, sigdecode=sigdecode_der))
                r, s = sigdecode_der(signature[:-1], SECP256k1.order)
                self.assertTrue(0 < r < SECP256k1.order)
                self.assertTrue(0 < s <= SECP256k1.order // 2)
                self.assertEqual(item['scriptSig'], bytes([len(signature)]).hex() + item['signature'] + bytes([len(bytes.fromhex(item['publicKey']))]).hex() + item['publicKey'])

    def test_ids_annotations_and_replay(self):
        for vector in vectors():
            result = vector['trace']
            data, raw = result['transaction'], bytes.fromhex(result['steps'][0]['hex'])
            self.assertEqual(data['signing']['txid'], double_sha(raw)[::-1].hex())
            self.assertEqual(data['signing']['unsignedTxid'], double_sha(bytes.fromhex(data['signing']['unsignedHex']))[::-1].hex())
            self.assertNotEqual(data['signing']['txid'], data['signing']['unsignedTxid'])
            offset = 0
            for field in data['fields']:
                self.assertEqual(field['start'], offset)
                self.assertGreater(field['end'], offset)
                offset = field['end']
                if field['label'].endswith('sighash type'):
                    self.assertEqual(raw[field['start']:field['end']], b'\x01')
            self.assertEqual(offset, len(raw))
            with contextlib.redirect_stdout(io.StringIO()) as stdout:
                exec(data['python'], {})
            self.assertEqual(stdout.getvalue().strip(), raw.hex())

    def test_output_change_invalidates_old_signature_but_input_amount_does_not(self):
        req = signed_request()
        before = trace(req)
        item = before['transaction']['signing']['inputs'][0]
        req['transaction']['inputs'][0]['amount'] = '100001'
        after = trace(req)
        self.assertEqual(before['steps'][0]['hex'], after['steps'][0]['hex'])
        self.assertEqual(after['transaction']['fee'], 1001)
        req['transaction']['outputs'][0]['amount'] = '59999'
        changed = trace(req)
        digest = digest_independently(req, changed, 0)
        verifier = VerifyingKey.from_string(bytes.fromhex(item['publicKey']), curve=SECP256k1)
        with self.assertRaises(BadSignatureError):
            verifier.verify_digest(bytes.fromhex(item['signature'])[:-1], digest, sigdecode=sigdecode_der)
        self.assertNotEqual(item['signature'], changed['transaction']['signing']['inputs'][0]['signature'])

    def test_outpoint_and_other_input_commitments(self):
        req = vectors()[-1]['input']
        before = trace(req)['transaction']['signing']['inputs']
        req['transaction']['inputs'][1]['vout'] = '259'
        after = trace(req)['transaction']['signing']['inputs']
        for old, new in zip(before, after):
            self.assertNotEqual(old['digest'], new['digest'])
        self.assertNotEqual(after[0]['digest'], after[1]['digest'])

    def test_six_modes_preview_and_signatures_match_independent_wire_preimages(self):
        for index in (0, 1):
            for mode in (1, 2, 3, 129, 130, 131):
                with self.subTest(index=index, mode=mode):
                    req = copy.deepcopy(vectors()[-1]['input'])
                    req['transaction']['inputs'][index]['sighashType'] = mode
                    preview_request = copy.deepcopy(req)
                    preview_request['previewSighash'] = True
                    preview = trace(preview_request)['sighash']['inputs'][index]
                    signed = trace(req)
                    item = signed['transaction']['signing']['inputs'][index]
                    preimage = sighash_preimage_independently(req, signed, index, mode)
                    digest = double_sha(preimage)
                    self.assertEqual(preview['preimage'], preimage.hex())
                    self.assertEqual(preview['digest'], digest.hex())
                    self.assertEqual(item['digest'], digest.hex())
                    self.assertEqual(item['sighashType'], mode)
                    signature = bytes.fromhex(item['signature'])
                    self.assertEqual(signature[-1], mode)
                    verifier = VerifyingKey.from_string(bytes.fromhex(item['publicKey']), curve=SECP256k1)
                    self.assertTrue(verifier.verify_digest(signature[:-1], digest, sigdecode=sigdecode_der))
                    with contextlib.redirect_stdout(io.StringIO()) as stdout:
                        exec(signed['transaction']['python'], {})
                    self.assertEqual(stdout.getvalue().strip(), signed['steps'][0]['hex'])

    def test_single_requires_matching_output_and_rejects_unsupported_modes(self):
        req = copy.deepcopy(vectors()[-1]['input'])
        req['transaction']['outputs'].pop()
        req['transaction']['inputs'][1]['sighashType'] = 3
        with self.assertRaisesRegex(ValueError, 'needs output 2'):
            trace(req)
        req['previewSighash'] = True
        with self.assertRaisesRegex(ValueError, 'needs output 2'):
            trace(req)
        for value in (0, 4, 128, 255, True, '1'):
            req = signed_request()
            req['transaction']['inputs'][0]['sighashType'] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'supported SIGHASH'):
                trace(req)

    def test_invalid_keys_and_mismatched_formats(self):
        for key in ['', '01', '0' * 64, 'f' * 64, 'z' * 64, '0' * 63 + '2']:
            req = signed_request()
            req['transaction']['inputs'][0]['privateKey'] = key
            with self.subTest(key=key), self.assertRaises(ValueError):
                trace(req)
        req = signed_request()
        req['transaction']['inputs'][0]['compressed'] = False
        with self.assertRaisesRegex(ValueError, 'do not match'):
            trace(req)
        req = copy.deepcopy(vectors()[-1]['input'])
        req['transaction']['inputs'][1]['privateKey'] = ''
        with self.assertRaisesRegex(ValueError, 'Input 2'):
            trace(req)


if __name__ == '__main__':
    unittest.main()
