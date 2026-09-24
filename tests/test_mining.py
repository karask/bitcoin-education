import hashlib
import json
import struct
import unittest
from test_p2pkh import adapter
from bitcoinutils.block import BlockHeader


ROOT = '11' * 32


def trace(start=0, count=64, difficulty='easy', root=ROOT):
    return json.loads(adapter.trace_lesson(json.dumps(dict(kind='mining', mining=dict(startNonce=start, count=count, difficulty=difficulty, merkleRoot=root)))))


def vectors():
    return [dict(input=dict(kind='mining', mining=dict(startNonce=s, count=c, difficulty=d, merkleRoot=ROOT)), trace=trace(s, c, d))
            for s, c, d in [(0, 1, 'easy'), (0, 64, 'easy'), (0, 64, 'harder'), (64, 256, 'harder')]]


class MiningTests(unittest.TestCase):
    def test_library_header_against_genesis_vector(self):
        header = BlockHeader(version=1, previous_block_hash=bytes(32),
                             merkle_root=bytes.fromhex('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'),
                             timestamp=1231006505, target_bits=0x1d00ffff, nonce=2083236893)
        self.assertEqual(header.get_block_hash(), '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f')
        self.assertEqual(len(header.serialize_header()), 80)

    def test_independent_header_hash_target_and_replay(self):
        for vector in vectors():
            data = vector['trace']['mining']
            bits = int(data['bits'], 16)
            expected_target = (bits & 0x7fffff) * 256 ** ((bits >> 24) - 3)
            self.assertEqual(int(data['target'], 16), expected_target)
            for row in data['attempts']:
                raw = struct.pack('<I', 2) + bytes(32) + bytes.fromhex('11' * 32) + struct.pack('<III', 1700000000, bits, row['nonce'])
                digest = hashlib.sha256(hashlib.sha256(raw).digest()).digest()[::-1].hex()
                self.assertEqual(digest, row['hash'])
                self.assertEqual(row['success'], int(digest, 16) <= expected_target)
            self.assertEqual(data['header'], raw.hex())
            namespace = {}
            exec(data['python'], namespace)
            self.assertEqual(namespace['header_hex'], data['header'])
            self.assertEqual(namespace['attempts'], data['attempts'])

    def test_bounded_search_stops_at_first_success(self):
        result = trace(0, 256)['mining']
        self.assertTrue(result['found'])
        self.assertTrue(result['attempts'][-1]['success'])
        self.assertFalse(any(item['success'] for item in result['attempts'][:-1]))
        self.assertEqual(result['nextNonce'], result['attempts'][-1]['nonce'] + 1)
        self.assertEqual(len(result['attempts']), result['nextNonce'])

    def test_invalid_nonce_ranges_and_targets(self):
        for args in [(-1, 1, 'easy'), (0, 0, 'easy'), (0, 257, 'easy'), (4294967295, 2, 'easy'), (True, 1, 'easy'), (0, 1, 'unknown')]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                trace(*args)
        with self.assertRaises(ValueError):
            trace(root='')
