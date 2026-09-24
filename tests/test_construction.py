"""Candidate assembly and Merkle integration against the published library wheel."""
import hashlib
import json
import unittest

from test_p2pkh import adapter
from test_signing import signed_request
from test_transactions import trace
from bitcoinutils.transactions import Transaction


def signed_fixture():
    result = trace(signed_request())
    return result['steps'][0]['hex'], result['transaction']['fee'], result['transaction']['signing']['txid']


def candidate(height=840000, budget=1000, include=True, network='mainnet'):
    hex_value, fee, _ = signed_fixture()
    request = dict(kind='construction', candidate=dict(hex=hex_value, fee=fee, height=height,
                                                       budget=budget, include=include, network=network))
    return json.loads(adapter.trace_lesson(json.dumps(request)))['candidate']


class ConstructionTests(unittest.TestCase):
    def test_coinbase_merkle_and_selected_transaction(self):
        data = candidate()
        _, _, signed_txid = signed_fixture()
        self.assertIn('yours', data['selected'])
        self.assertIn(signed_txid, data['merkle']['txids'])
        self.assertEqual(data['merkle']['txids'][0], data['coinbase']['txid'])
        self.assertEqual(data['used'], sum(entry['vsize'] for entry in data['entries'] if entry['selected']))
        self.assertEqual(data['fees'], sum(entry['fee'] for entry in data['entries'] if entry['selected']))
        self.assertEqual(data['reward'], data['subsidy'] + data['fees'])
        coinbase = Transaction.from_raw(data['coinbase']['hex'])
        self.assertEqual(coinbase.outputs[0].amount, data['reward'])
        self.assertEqual(coinbase.inputs[0].script_sig.script[0], data['coinbase']['scriptSig'])
        self.assertTrue(data['coinbase']['scriptSig'].startswith('0340d10c'))
        self.assertFalse(data['merkle']['mutated'])
        self.assertEqual(data['merkle']['root_internal'], bytes.fromhex(data['merkle']['root'])[::-1].hex())

        # Independently fold the displayed TXIDs in Bitcoin's internal byte order.
        row = [bytes.fromhex(txid)[::-1] for txid in data['merkle']['txids']]
        while len(row) > 1:
            if len(row) % 2:
                row.append(row[-1])
            row = [hashlib.sha256(hashlib.sha256(row[i] + row[i + 1]).digest()).digest()
                   for i in range(0, len(row), 2)]
        self.assertEqual(row[0][::-1].hex(), data['merkle']['root'])
        self.assertTrue(any(pair['duplicated'] for pair in candidate(budget=600)['merkle']['pairs']))
        namespace = {}
        exec(data['python'], namespace)
        self.assertEqual(namespace['merkle']['root'], data['merkle']['root'])

    def test_selection_and_height_change_the_commitment(self):
        full = candidate()
        narrow = candidate(budget=300)
        omitted = candidate(include=False)
        before = candidate(height=839999)
        self.assertNotIn('yours', omitted['selected'])
        self.assertNotEqual(full['merkle']['root'], narrow['merkle']['root'])
        self.assertNotEqual(full['merkle']['root'], omitted['merkle']['root'])
        self.assertNotEqual(full['merkle']['root'], before['merkle']['root'])
        self.assertEqual(before['subsidy'], 625_000_000)
        self.assertEqual(full['subsidy'], 312_500_000)

    def test_invalid_candidate_options(self):
        raw, fee, _ = signed_fixture()
        for updates in ({'height': -1}, {'budget': 999}, {'fee': -1}, {'hex': 'zz'},
                        {'include': 1}, {'network': 'unknown'}):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                options = dict(hex=raw, fee=fee, height=840000, budget=1000, include=True, network='mainnet')
                options.update(updates)
                adapter.trace_lesson(json.dumps(dict(kind='construction', candidate=options)))

    def test_mining_header_commits_to_constructed_root(self):
        data = candidate()
        root = data['merkle']['root']
        mining = json.loads(adapter.trace_lesson(json.dumps(dict(kind='mining', mining=dict(
            startNonce=0, count=1, difficulty='easy', merkleRoot=root)))))['mining']
        self.assertEqual(mining['header'][72:136], data['merkle']['root_internal'])
        self.assertEqual(mining['merkleRoot'], root)


if __name__ == '__main__':
    unittest.main()
