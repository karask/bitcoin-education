"""P2WSH and P2SH-P2WPKH: independent wire, BIP143, execution, and block checks."""
import contextlib
import copy
import hashlib
import io
import itertools
import struct
import unittest

from test_transactions import trace
from test_signing import double_sha
from test_native_transactions import parse_wire, independent_preimage as key_preimage
from test_p2sh_transactions import request as multisig_request, KEYS
from test_native_journey import candidate_request, fold_hashes
from bitcoinutils.keys import PrivateKey, PublicKey, P2shAddress, P2wshAddress
from bitcoinutils.script import Script
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Transaction
from bitcoin_education import trace_p2wsh_input, trace_nested_p2wpkh_input
from bitcoin_education.p2wsh import p2wsh_address_to_script
from ecdsa.util import sigdecode_der


def request(kind='p2wsh', network='mainnet', threshold=2, multiple=False, signers=None):
    req = multisig_request(network, threshold, multiple=multiple, signers=signers)
    setup(network)
    req['transaction']['spendType'] = kind
    for index, row in enumerate(req['transaction']['inputs']):
        if kind == 'p2wsh':
            script = Script.from_raw(row.pop('redeemScript'))
            row.update(witnessScript=script.to_hex(), source=P2wshAddress(script=script).to_string())
        else:
            key = PrivateKey(secret_exponent=index + 1)
            program = key.get_public_key().get_segwit_address().to_script_pub_key()
            row.pop('signerKeys')
            row.update(redeemScript=program.to_hex(), source=P2shAddress(script=program).to_string(),
                       privateKey=f'{index + 1:064x}', compressed=True)
    for index, out in enumerate(req['transaction']['outputs']):
        if kind == 'p2wsh':
            script = Script(['OP_1' if index == 0 else f'OP_{threshold}', *KEYS, 'OP_3', 'OP_CHECKMULTISIG'])
            out['address'] = P2wshAddress(script=script).to_string()
        else:
            program = PrivateKey(secret_exponent=2 if index == 0 else 1).get_public_key().get_segwit_address().to_script_pub_key()
            out['address'] = P2shAddress(script=program).to_string()
    return req


def execution_request(signed, index=0, experiment='original'):
    data = signed['transaction']
    return dict(kind='execution', network=signed['network'], execution=dict(hex=signed['steps'][0]['hex'],
                previousScript=data['previousScripts'][index], amount=data['previousAmounts'][index],
                inputIndex=index, spendType=data['spendType'], experiment=experiment))


def independent_preimage(req, raw, index, mode):
    if req['transaction']['spendType'] == 'nested':
        return key_preimage(req, raw, index, mode)
    rows = req['transaction']['inputs']
    _, _, outputs, _ = parse_wire(raw)
    base, anyone = mode & 31, bool(mode & 128)
    outpoints = [bytes.fromhex(row['txid'])[::-1] + struct.pack('<I', int(row['vout'])) for row in rows]
    prevouts = bytes(32) if anyone else double_sha(b''.join(outpoints))
    sequence = bytes(32) if anyone or base in (2, 3) else double_sha(b'\xff' * (4 * len(rows)))
    hash_outputs = double_sha(b''.join(outputs)) if base == 1 else double_sha(outputs[index]) if base == 3 and index < len(outputs) else bytes(32)
    script = bytes.fromhex(rows[index]['witnessScript'])
    return (struct.pack('<I', 2) + prevouts + sequence + outpoints[index] + bytes([len(script)]) + script
            + struct.pack('<Q', int(rows[index]['amount'])) + b'\xff' * 4 + hash_outputs + struct.pack('<II', 0, mode))


def wasm_vectors():
    requests = []
    for kind in ('p2wsh', 'nested'):
        for network in ('mainnet', 'testnet'):
            for threshold in ((1, 2, 3) if kind == 'p2wsh' else (2,)):
                req = request(kind, network, threshold, multiple=True)
                requests.extend([req, dict(req, signTransaction=False)])
        for mode in (1, 2, 3, 129, 130, 131):
            req = request(kind, multiple=True)
            req['transaction']['inputs'][1]['sighashType'] = mode
            requests.extend([req, dict(req, previewSighash=True)])
        signed = trace(request(kind))
        experiments = ('original', 'key', 'signature', 'amount', 'output') + (('order', 'dummy', 'missing') if kind == 'p2wsh' else ('redeem', 'extra'))
        requests.extend(execution_request(signed, experiment=exp) for exp in experiments)
        requests.extend(candidate_request(signed, **updates) for updates in ({}, {'include':False}, {'budget':300}))
    return [dict(input=req, trace=trace(req)) for req in requests]


class WitnessJourneyTests(unittest.TestCase):
    def test_wire_layout_ids_sizes_signer_subsets_and_replay(self):
        for kind in ('p2wsh', 'nested'):
            for network in ('mainnet', 'testnet'):
                for threshold in ((1, 2, 3) if kind == 'p2wsh' else (2,)):
                    for subset in itertools.combinations((1,2,3), threshold) if kind == 'p2wsh' else [(1,2)]:
                        req = request(kind, network, threshold, multiple=True, signers=subset[::-1])
                        signed = trace(req); data = signed['transaction']; raw = bytes.fromhex(signed['steps'][0]['hex'])
                        unsigned = trace(dict(req, signTransaction=False))
                        base, scripts, outputs, stacks = parse_wire(raw)
                        self.assertEqual(data['txid'], double_sha(base)[::-1].hex())
                        self.assertEqual(data['wtxid'], double_sha(raw)[::-1].hex())
                        self.assertNotEqual(data['txid'], data['wtxid'])
                        self.assertEqual(data['txid'] == unsigned['transaction']['txid'], kind == 'p2wsh')
                        self.assertEqual(data['baseSize'],len(base)); self.assertEqual(data['totalSize'],len(raw))
                        self.assertEqual(data['weight'],len(base)*3+len(raw)); self.assertEqual(data['vsize'],(len(base)*3+len(raw)+3)//4)
                        self.assertEqual([i for f in data['fields'] for i in range(f['start'],f['end'])],list(range(len(raw))))
                        self.assertEqual([out[8:11].hex() for out in outputs], ['220020']*2 if kind=='p2wsh' else ['17a914']*2)
                        for i, item in enumerate(data['signing']['inputs']):
                            if kind == 'p2wsh':
                                self.assertEqual(scripts[i], b'')
                                self.assertEqual(stacks[i], [b'']+[bytes.fromhex(v) for v in item['signatures']]+[bytes.fromhex(item['witnessScript'])])
                                self.assertEqual(item['signerIndexes'],list(subset))
                                self.assertEqual(data['previousScripts'][i], '0020'+hashlib.sha256(stacks[i][-1]).hexdigest())
                                sigs,keys=item['signatures'],item['publicKeys']
                            else:
                                self.assertEqual(scripts[i], bytes.fromhex('16'+item['redeemScript']))
                                self.assertEqual(stacks[i], [bytes.fromhex(item['signature']),bytes.fromhex(item['publicKey'])])
                                sigs,keys=[item['signature']],[item['publicKey']]
                            for sig,key in zip(sigs,keys):
                                self.assertTrue(PublicKey(key).key.verify_digest(bytes.fromhex(sig)[:-1],bytes.fromhex(item['digest']),sigdecode=sigdecode_der))
                            result=trace(execution_request(signed,i))['execution']
                            self.assertTrue(result['success'],result['error']); self.assertTrue(result['clean_stack'])
                            self.assertEqual(result['final_stack'],['01'])
                            for left,right in zip(result['steps'],result['steps'][1:]): self.assertEqual(left['stack_after'],right['stack_before'])
                            ns={};exec(result['python'],ns);self.assertEqual(ns['result']['steps'],result['steps'])
                        ns={}
                        with contextlib.redirect_stdout(io.StringIO()): exec(data['python'],ns)
                        self.assertEqual(ns['raw_hex'],raw.hex())
                        tx=Transaction.from_raw(raw.hex()); before=tx.get_txid(); wbefore=tx.get_wtxid()
                        tx.witnesses[0].stack[1 if kind=='p2wsh' else 0]='00'
                        self.assertEqual(tx.get_txid(),before);self.assertNotEqual(tx.get_wtxid(),wbefore)

    def test_all_bip143_modes_independent_preimages_and_experiments(self):
        for kind in ('p2wsh','nested'):
            for mode in (1,2,3,129,130,131):
                req=request(kind,multiple=True)
                for row in req['transaction']['inputs']: row['sighashType']=mode
                signed=trace(req); preview=trace(dict(req,previewSighash=True))['sighash']
                for index,item in enumerate(signed['transaction']['signing']['inputs']):
                    expected=independent_preimage(req,bytes.fromhex(signed['steps'][0]['hex']),index,mode)
                    self.assertEqual(preview['inputs'][index]['preimage'],expected.hex())
                    self.assertEqual(item['digest'],double_sha(expected).hex())
                    ns={};exec(preview['inputs'][index]['python'],ns)
                    self.assertEqual(ns['result']['digest'],item['digest'])
                    experiments=('original','key','signature','output','amount')+(('order','missing','dummy') if kind=='p2wsh' else ('redeem','extra'))
                    for experiment in experiments:
                        result=trace(execution_request(signed,index,experiment))['execution']
                        succeeds=experiment=='original' or experiment=='output' and (mode&31==2 or mode&31==3 and index!=0)
                        self.assertEqual(result['success'],succeeds,(kind,mode,index,experiment,result['error']))
                        self.assertEqual(result['clean_stack'],succeeds)
                        if experiment=='key':self.assertEqual(result['error']['code'],'WITNESS_SCRIPT_HASH_MISMATCH' if kind=='p2wsh' else 'EQUALVERIFY_FAILED')
                        if experiment=='dummy':self.assertEqual(result['error']['code'],'NULLDUMMY')
                        if experiment=='missing':self.assertEqual(result['error']['code'],'SIGNATURE_COUNT')
                        if experiment=='redeem':self.assertEqual(result['error']['code'],'SCRIPT_HASH_MISMATCH')
                        if experiment=='extra':self.assertEqual(result['error']['code'],'INVALID_NESTED_SCRIPTSIG')

    def test_single_without_matching_output(self):
        for kind in ('p2wsh','nested'):
            for mode in (3,131):
                req=request(kind,multiple=True);req['transaction']['outputs'].pop();req['transaction']['inputs'][1]['sighashType']=mode
                signed=trace(req); pre=trace(dict(req,previewSighash=True))['sighash']['inputs'][1]
                self.assertEqual(pre['preimage'],independent_preimage(req,bytes.fromhex(signed['steps'][0]['hex']),1,mode).hex())
                self.assertTrue(trace(execution_request(signed,1))['execution']['success'])
                self.assertTrue(trace(execution_request(signed,1,'output'))['execution']['success'])
                self.assertFalse(trace(execution_request(signed,1,'amount'))['execution']['success'])

    def test_witness_commitment_selection_and_mining(self):
        for kind in ('p2wsh','nested'):
            for network in ('mainnet','testnet'):
                signed=trace(request(kind,network));candidate=trace(candidate_request(signed))['candidate'];commit=candidate['witnessCommitment']
                selected=[next(e for e in candidate['entries'] if e['id']==id) for id in candidate['selected']]
                self.assertIn('yours',candidate['selected'])
                self.assertEqual(commit['witness_tree']['txids'],['00'*32]+[e['wtxid'] for e in selected])
                root=fold_hashes(commit['witness_tree']['txids'])
                self.assertEqual(commit['commitment_script'],'6a24aa21a9ed'+double_sha(root+bytes(32)).hex())
                self.assertEqual(candidate['merkle']['root_internal'],fold_hashes(candidate['merkle']['txids']).hex())
                mining=trace(dict(kind='mining',mining=dict(merkleRoot=candidate['merkle']['root'],count=1)))['mining']
                self.assertEqual(mining['header'][72:136],candidate['merkle']['root_internal'])
                for updates in ({'include':False},{'budget':300}):
                    omitted=trace(candidate_request(signed,**updates))['candidate']
                    self.assertNotIn('yours',omitted['selected']);self.assertIsNone(omitted['witnessCommitment'])

    def test_invalid_context_and_helpers_do_not_mutate(self):
        for kind,helper in (('p2wsh',trace_p2wsh_input),('nested',trace_nested_p2wpkh_input)):
            signed=trace(request(kind));tx=Transaction.from_raw(signed['steps'][0]['hex']);lock=Script.from_raw(signed['transaction']['previousScripts'][0])
            before=tx.serialize();self.assertTrue(helper(tx,0,lock,100000)['success']);self.assertEqual(tx.serialize(),before)
            for amount in (-1,True,'100000',None): self.assertEqual(helper(tx,0,lock,amount)['error']['code'],'INVALID_AMOUNT')
            for index in (-1,True,1):self.assertEqual(helper(tx,index,lock,100000)['error']['code'],'INVALID_INPUT_INDEX')
            altered=Transaction.copy(tx);altered.witnesses=[]
            self.assertEqual(helper(altered,0,lock,100000)['error']['code'],'WITNESS_COUNT_MISMATCH')
            for update in ({'source':'bad'},{'compressed':False,'privateKey':'1'.zfill(64)} if kind=='nested' else {'signerKeys':['1'.zfill(64),'4'.zfill(64)]},
                           {'redeemScript':'0014'+'00'*20} if kind=='nested' else {'witnessScript':'51'}):
                req=request(kind);req['transaction']['inputs'][0].update(update)
                with self.assertRaises(ValueError):trace(req)
        signed=trace(request());tx=Transaction.from_raw(signed['steps'][0]['hex']);lock=Script.from_raw(signed['transaction']['previousScripts'][0])
        for value,code in [('300001','INVALID_DER_SIGNATURE'),('', 'CHECKMULTISIG_FAILED'),(tx.witnesses[0].stack[1][:-2]+'04','UNSUPPORTED_SIGHASH')]:
            altered=Transaction.copy(tx);altered.witnesses[0].stack[1]=value
            self.assertEqual(trace_p2wsh_input(altered,0,lock,100000)['error']['code'],code)
        altered=Transaction.copy(tx);altered.witnesses[0].stack[0]='ab'*521
        self.assertEqual(trace_p2wsh_input(altered,0,lock,100000)['error']['code'],'WITNESS_ITEM_TOO_LARGE')
        altered=Transaction.copy(tx);altered.inputs[0].script_sig=Script(['OP_0'])
        self.assertEqual(trace_p2wsh_input(altered,0,lock,100000)['error']['code'],'NONEMPTY_SCRIPTSIG')

    def test_p2wsh_address_decoder_rejects_wrong_program_version_and_network(self):
        from bitcoinutils.bech32 import encode
        setup('mainnet')
        address=request()['transaction']['inputs'][0]['source']
        script=p2wsh_address_to_script(address)
        self.assertEqual(len(script.to_bytes()),34)
        self.assertEqual(p2wsh_address_to_script(address.upper()).to_hex(),script.to_hex())
        for invalid in (encode('bc',0,bytes(20)), encode('bc',1,bytes(32)), encode('tb',0,bytes(32)),address[:-1]+'q'):
            with self.assertRaises(ValueError):p2wsh_address_to_script(invalid)

    def test_script_key_order_and_amount_metadata(self):
        req=request(signers=(1,2));row=req['transaction']['inputs'][0]
        script=Script(['OP_2',KEYS[1],KEYS[2],KEYS[0],'OP_3','OP_CHECKMULTISIG'])
        row.update(witnessScript=script.to_hex(),source=P2wshAddress(script=script).to_string())
        signed=trace(req);self.assertEqual(signed['transaction']['signing']['inputs'][0]['signerIndexes'],[1,3])
        self.assertTrue(trace(execution_request(signed))['execution']['success'])
        for kind in ('p2wsh','nested'):
            req=request(kind);unsigned=trace(dict(req,signTransaction=False));signed=trace(req)
            changed=copy.deepcopy(req);changed['transaction']['inputs'][0]['amount']='100001'
            self.assertEqual(trace(dict(changed,signTransaction=False))['steps'][0]['hex'],unsigned['steps'][0]['hex'])
            self.assertNotEqual(trace(changed)['transaction']['signing']['inputs'][0]['digest'],signed['transaction']['signing']['inputs'][0]['digest'])
            changed['network']='testnet'
            with self.assertRaises(ValueError):trace(changed)
