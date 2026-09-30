"""Exercise the native screens' adapter requests through signing, mining, and omission."""
import unittest

from test_transactions import trace
from test_native_transactions import request, parse_wire
from test_signing import double_sha
from bitcoinutils.transactions import Transaction


def execution_request(signed, index=0, experiment='original'):
    data = signed['transaction']
    return dict(kind='execution', execution=dict(
        hex=signed['steps'][0]['hex'], previousScript=data['previousScripts'][index],
        amount=data['previousAmounts'][index], inputIndex=index,
        spendType='p2wpkh', experiment=experiment))


def candidate_request(signed, **updates):
    return dict(kind='construction', candidate=dict(
        hex=signed['steps'][0]['hex'], fee=signed['transaction']['fee'],
        **({'network': signed['network'], 'height': 840000, 'budget': 1000, 'include': True} | updates)))


def fold_hashes(display_hashes):
    row = [bytes.fromhex(value)[::-1] for value in display_hashes]
    while len(row) > 1:
        if len(row) % 2:
            row.append(row[-1])
        row = [double_sha(row[i] + row[i + 1]) for i in range(0, len(row), 2)]
    return row[0]


class NativeJourneyTests(unittest.TestCase):
    def test_execution_modes_inputs_and_experiments(self):
        for network in ('mainnet', 'testnet'):
            for index in (0, 1):
                for mode in (1, 2, 3, 129, 130, 131):
                    req = request(network, multiple=True)
                    req['transaction']['inputs'][index]['sighashType'] = mode
                    signed = trace(req)
                    original_hex = signed['steps'][0]['hex']
                    for experiment in ('original', 'key', 'signature', 'output', 'amount'):
                        with self.subTest(network=network, index=index, mode=mode, experiment=experiment):
                            data = trace(execution_request(signed, index, experiment))['execution']
                            fails_output = (mode & 31) == 1 or (mode & 31) == 3 and index == 0
                            succeeds = experiment == 'original' or experiment == 'output' and not fails_output
                            self.assertEqual(data['success'], succeeds)
                            self.assertEqual(data['clean_stack'], succeeds)
                            if succeeds:
                                self.assertEqual(data['final_stack'], ['01'])
                            else:
                                self.assertEqual(data['error']['code'], 'EQUALVERIFY_FAILED' if experiment == 'key' else 'CHECKSIG_FAILED')
                            self.assertEqual([step['instruction'] for step in data['steps'][:2]], ['LOAD_SIGNATURE', 'LOAD_PUBLIC_KEY'])
                            self.assertTrue(all(step['kind'] == 'witness_load' for step in data['steps'][:2]))
                            self.assertTrue(all(step['phase'] == 'scriptCode' for step in data['steps'][2:]))
                            if experiment == 'original':
                                self.assertEqual(data['digest'], signed['transaction']['signing']['inputs'][index]['digest'])
                                self.assertEqual(data['sighash_byte'], mode)
                            for before, after in zip(data['steps'], data['steps'][1:]):
                                self.assertEqual(before['stack_after'], after['stack_before'])
                            namespace = {}
                            exec(data['python'], namespace)
                            self.assertEqual(namespace['result']['steps'], data['steps'])
                            self.assertEqual(signed['steps'][0]['hex'], original_hex)

    def test_native_candidate_commitment_and_mining_header(self):
        for network in ('mainnet', 'testnet'):
            signed = trace(request(network, multiple=True))
            req = candidate_request(signed)
            candidate = trace(req)['candidate']
            commitment = candidate['witnessCommitment']
            selected = [next(entry for entry in candidate['entries'] if entry['id'] == id) for id in candidate['selected']]
            self.assertIn('yours', candidate['selected'])
            yours = next(entry for entry in selected if entry['id'] == 'yours')
            self.assertEqual(yours['vsize'], signed['transaction']['vsize'])
            self.assertEqual(yours['wtxid'], signed['transaction']['wtxid'])
            base, _, _, _ = parse_wire(bytes.fromhex(signed['steps'][0]['hex']))
            self.assertEqual(yours['vsize'], (len(base) * 3 + len(bytes.fromhex(signed['steps'][0]['hex'])) + 3) // 4)
            self.assertEqual(candidate['used'], sum(entry['vsize'] for entry in selected))
            self.assertEqual(commitment['witness_tree']['txids'], ['00' * 32] + [entry['wtxid'] for entry in selected])
            witness_root = fold_hashes(commitment['witness_tree']['txids'])
            self.assertEqual(commitment['witness_root_internal'], witness_root.hex())
            commitment_hash = double_sha(witness_root + bytes(32)).hex()
            self.assertEqual(commitment['commitment_hash'], commitment_hash)
            self.assertEqual(commitment['commitment_script'], '6a24aa21a9ed' + commitment_hash)
            self.assertEqual(commitment['commitment_preimage'], witness_root.hex() + '00' * 32)
            coinbase = Transaction.from_raw(candidate['coinbase']['hex'])
            self.assertTrue(coinbase.has_segwit)
            self.assertEqual(coinbase.witnesses[0].stack, ['00' * 32])
            self.assertEqual(coinbase.outputs[-1].amount, 0)
            self.assertEqual(coinbase.outputs[-1].script_pubkey.to_hex(), commitment['commitment_script'])
            self.assertEqual(coinbase.outputs[0].amount, candidate['subsidy'] + candidate['fees'])
            txids = [coinbase.get_txid()] + [entry['txid'] for entry in selected]
            self.assertEqual(candidate['merkle']['txids'], txids)
            self.assertEqual(candidate['merkle']['root_internal'], fold_hashes(txids).hex())
            self.assertEqual(commitment['ordinary_tree'], candidate['merkle'])
            mining = trace(dict(kind='mining', mining=dict(merkleRoot=candidate['merkle']['root'], count=64)))['mining']
            self.assertEqual(mining['header'][72:136], candidate['merkle']['root_internal'])
            namespace = {}
            exec(candidate['python'], namespace)
            self.assertEqual(namespace['coinbase'].to_hex(), candidate['coinbase']['hex'])
            self.assertEqual(namespace['merkle'], candidate['merkle'])

    def test_omitted_or_skipped_native_transaction_needs_no_commitment(self):
        signed = trace(request())
        full = trace(candidate_request(signed))['candidate']
        for updates in ({'include': False}, {'budget': 300}):
            req = candidate_request(signed)
            req['candidate'].update(updates)
            data = trace(req)['candidate']
            self.assertNotIn('yours', data['selected'])
            self.assertIsNone(data['witnessCommitment'])
            self.assertFalse(Transaction.from_raw(data['coinbase']['hex']).has_segwit)
            self.assertNotEqual(full['merkle']['root'], data['merkle']['root'])

    def test_native_single_without_matching_output_still_executes(self):
        for mode in (3, 131):
            req = request(multiple=True)
            req['transaction']['outputs'].pop()
            req['transaction']['inputs'][1]['sighashType'] = mode
            signed = trace(req)
            self.assertTrue(trace(execution_request(signed, 1))['execution']['success'])
            self.assertTrue(trace(execution_request(signed, 1, 'output'))['execution']['success'])
            self.assertFalse(trace(execution_request(signed, 1, 'amount'))['execution']['success'])

    def test_execution_rejects_missing_amount_and_invalid_index(self):
        signed = trace(request())
        for amount in (None, -1, True, '100000'):
            req = execution_request(signed)
            req['execution']['amount'] = amount
            with self.assertRaisesRegex(ValueError, 'integer satoshis'):
                trace(req)
        req = execution_request(signed)
        req['execution']['inputIndex'] = 1
        with self.assertRaisesRegex(ValueError, 'input index'):
            trace(req)


def wasm_vectors():
    results = []
    for mode in (1, 2, 3, 129, 130, 131):
        req = request('testnet', multiple=True)
        req['transaction']['inputs'][1]['sighashType'] = mode
        signed = trace(req)
        for experiment in ('original', 'key', 'signature', 'output', 'amount'):
            input = execution_request(signed, 1, experiment)
            results.append(dict(input=input, trace=trace(input)))
    for updates in ({}, {'include': False}, {'budget': 300}, {'budget': 600}, {'height': 839999}):
        req = candidate_request(trace(request()))
        req['candidate'].update(updates)
        results.append(dict(input=req, trace=trace(req)))
    return results
