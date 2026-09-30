"""Taproot vectors, independent commitments, scoped validation and journey tests."""
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import unittest

from python_test_support import adapter
from bitcoinutils.keys import PrivateKey, PublicKey
from bitcoinutils.script import Script
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Transaction
from bitcoinutils.schnorr import schnorr_verify
from bitcoin_education.taproot import (MODES, PUBLIC_KEYS, SECRET, tree_metadata, taproot_template,
    trace_taproot_input, trace_taproot_sighash, taproot_address_to_script)


def trace(request):
    return json.loads(adapter.trace_lesson(json.dumps(request)))


def request(tree=False, path='key', count=2, network='mainnet', mode=0, multiple=False, subset=(2,3)):
    setup(network)
    source = tree_metadata(count, path)['address'] if tree else PrivateKey(secret_exponent=1).get_public_key().get_taproot_address().to_string()
    row = dict(txid='0123456789abcdef'*4, vout='0', amount='100000', sourceType='address', source=source,
               taprootLeaves=count, taprootPath=path, internalKey=PUBLIC_KEYS[0], sighashType=mode,
               privateKey=f'{5 if path=="recovery" else 6 if path=="hashlock" else 1:064x}',
               signerKeys=[f'{i:064x}' for i in subset], secret=SECRET.hex(),
               sequence='144' if path=='recovery' else '4294967295')
    rows=[row]
    if multiple:
        rows.append(dict(row, txid='fedcba9876543210'*4, vout='2', amount='50000'))
    recipient=PrivateKey(secret_exponent=2).get_public_key().get_taproot_address().to_string()
    return dict(kind='transaction', network=network, signTransaction=True,
                transaction=dict(spendType='p2tr-script' if tree else 'p2tr', inputs=rows,
                    outputs=[dict(address=recipient, amount='60000'),dict(address=source,amount='89000' if multiple else '39000')]))


def execution_request(signed, experiment='original', index=0, age=144):
    data=signed['transaction']
    return dict(kind='execution',network=signed['network'],execution=dict(hex=signed['steps'][0]['hex'],inputIndex=index,
        previousScript=data['previousScripts'][index],previousScripts=data['previousScripts'],
        amount=data['previousAmounts'][index],amounts=data['previousAmounts'],spendType=data['spendType'],experiment=experiment,age=age))


def tagged(tag, raw):
    h=hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(h+h+raw).digest()


class TaprootTests(unittest.TestCase):
    def test_official_bip341_messages_digests_and_signatures(self):
        vectors=json.loads((Path(__file__).parent/'fixtures/bip341-wallet-test-vectors.json').read_text())
        for vector in vectors['keyPathSpending']:
            given=vector['given'];tx=Transaction.from_raw(given['rawUnsignedTx'])
            # Core's object parser normalizes the vector's nonstandard second output.
            # Preserve the official wire script so SINGLE signs the original bytes.
            from test_native_transactions import parse_wire
            class SerializedScript(Script):
                def __init__(self, raw):
                    super().__init__([]); self.raw = raw
                def to_bytes(self):
                    return self.raw
            _, _, wire_outputs, _ = parse_wire(bytes.fromhex(given['rawUnsignedTx']))
            for output, wire in zip(tx.outputs, wire_outputs):
                assert wire[8] < 253
                output.script_pubkey = SerializedScript(wire[9:])
            scripts=[Script.from_raw(u['scriptPubKey']) for u in given['utxosSpent']]
            amounts=[u['amountSats'] for u in given['utxosSpent']]
            for item in vector['inputSpending']:
                g=item['given'];index,mode=g['txinIndex'],g['hashType']
                exact=trace_taproot_sighash(tx,index,scripts,amounts,mode)
                self.assertEqual(exact['preimage'],item['intermediary']['sigMsg'])
                self.assertEqual(exact['digest'],item['intermediary']['sigHash'])
                signature=item['expected']['witness'][0]
                self.assertTrue(schnorr_verify(bytes.fromhex(exact['digest']),bytes.fromhex(scripts[index].to_hex()[4:]),bytes.fromhex(signature)[:64]))
                key=PrivateKey.from_bytes(bytes.fromhex(g['internalPrivkey']))
                self.assertEqual(key.sign_taproot_input(tx,index,scripts,amounts,tapleaf_scripts=bytes.fromhex(g['merkleRoot']) if g['merkleRoot'] else None,sighash=mode),signature)
        # Published odd-y/internal-key vector exercises even-y normalization.
        for item in vectors['scriptPubKey']:
            if item['given']['scriptTree'] is None:
                pub=PublicKey('02'+item['given']['internalPubkey'])
                self.assertEqual(pub.get_taproot_address().to_script_pub_key().to_hex(),item['expected']['scriptPubKey'])

    def test_defaults_all_paths_networks_annotations_and_copied_python(self):
        for network in ('mainnet','testnet'):
            for tree,path,count in [(False,'key',2),(True,'key',2),(True,'multisig',2),(True,'recovery',2),(True,'multisig',3),(True,'recovery',3),(True,'hashlock',3)]:
                req=request(tree,path,count,network)
                signed=trace(req);data=signed['transaction'];raw=signed['steps'][0]['hex']
                self.assertTrue(trace(execution_request(signed))['execution']['success'],(network,path,count))
                unsigned=trace(dict(req,signTransaction=False))
                self.assertEqual(data['txid'],unsigned['transaction']['txid'])
                self.assertNotEqual(data['txid'],data['wtxid'])
                self.assertEqual(data['weight'],4*data['baseSize']+data['totalSize']-data['baseSize'])
                self.assertEqual(data['vsize'],(data['weight']+3)//4)
                self.assertEqual(data['fields'][0]['start'],0)
                self.assertEqual(data['fields'][-1]['end'],len(raw)//2)
                for left,right in zip(data['fields'],data['fields'][1:]): self.assertEqual(left['end'],right['start'])
                item=data['signing']['inputs'][0]
                self.assertTrue(all(len(s)==128 for s in item['signatures']))
                tx=Transaction.from_raw(raw)
                self.assertEqual(tx.inputs[0].script_sig.to_hex(),'')
                self.assertEqual(len(tx.witnesses[0].stack),1 if path=='key' else 5 if path=='multisig' else 4 if path=='hashlock' else 3)
                ns={}
                with contextlib.redirect_stdout(io.StringIO()):exec(data['python'],ns)
                self.assertEqual(ns['tx'].serialize(),raw)
                exec(trace(execution_request(signed))['execution']['python'],ns)
                self.assertTrue(ns['result']['success'])
                if tree:
                    meta=data['taproot'][0]
                    leaf=next((l for l in meta['leaves'] if l['path']==path),None)
                    if leaf:
                        self.assertEqual(leaf['witnessBytes'],len(tx.witnesses[0].to_bytes())+1)
                    expected_depths=[1,1] if count==2 else [1,2,2]
                    self.assertEqual([len(l['proof']) for l in meta['leaves']],expected_depths)
                    for l in meta['leaves']:
                        raw_leaf=bytes.fromhex(l['script']);h=tagged('TapLeaf',b'\xc0'+bytes([len(raw_leaf)])+raw_leaf)
                        self.assertEqual(h.hex(),l['leafHash'])
                        for sibling in l['proof']:
                            pair=sorted([h,bytes.fromhex(sibling)]);h=tagged('TapBranch',b''.join(pair))
                        self.assertEqual(h.hex(),meta['merkleRoot'])

    def test_modes_commit_all_previous_locks_amounts_and_sequences_unless_anyonecanpay(self):
        for tree,path,count in [(False,'key',2),(True,'multisig',2),(True,'hashlock',3)]:
            for mode in MODES:
                req=request(tree,path,count,mode=mode,multiple=True)
                signed=trace(req);pre=trace(dict(req,previewSighash=True))['sighash']
                for index,item in enumerate(signed['transaction']['signing']['inputs']):
                    self.assertEqual(item['digest'],pre['inputs'][index]['digest'])
                    self.assertEqual(len(item['signature'])//2,64 if mode==0 else 65)
                    for experiment in ('signature','output','amount','other-amount'):
                        result=trace(execution_request(signed,experiment,index))['execution']
                        expected=experiment=='other-amount' and bool(mode&128) or experiment=='output' and (mode&3==2 or mode&3==3 and index==1)
                        self.assertEqual(result['success'],expected,(tree,path,mode,index,experiment,result['error']))
                tx=Transaction.from_raw(signed['steps'][0]['hex'])
                locks=[Script.from_raw(s) for s in signed['transaction']['previousScripts']]
                amounts=signed['transaction']['previousAmounts']
                leaf=Script.from_raw(signed['transaction']['signing']['inputs'][0]['tapleafScript']) if tree else None
                original=trace_taproot_sighash(tx,0,locks,amounts,mode,leaf)['digest']
                tx.inputs[1].sequence=b'\x01\x00\x00\x00'
                self.assertEqual(trace_taproot_sighash(tx,0,locks,amounts,mode,leaf)['digest']==original,bool(mode&128))
                locks[1]=Script(['OP_1','00'*32])
                self.assertEqual(trace_taproot_sighash(tx,0,locks,amounts,mode,leaf)['digest']==original,bool(mode&128))

    def test_proofs_threshold_and_hashlock_failures(self):
        for subset in ((2,3),(2,4),(3,4)):
            signed=trace(request(True,'multisig',3,subset=subset))
            self.assertTrue(trace(execution_request(signed))['execution']['success'])
            for experiment in ('control','leaf','order','missing'):
                self.assertFalse(trace(execution_request(signed,experiment))['execution']['success'],(subset,experiment))
        for path,count in [('recovery',2),('hashlock',3)]:
            signed=trace(request(True,path,count))
            for exp in ('control','leaf')+ (('secret',) if path=='hashlock' else ()):
                self.assertFalse(trace(execution_request(signed,exp))['execution']['success'])
        req=request(True,'multisig');req['transaction']['inputs'][0]['signerKeys']=[f'{2:064x}',f'{2:064x}']
        with self.assertRaises(ValueError):trace(req)

    def test_relative_lock_boundaries_are_context_checks(self):
        signed=trace(request(True,'recovery'))
        for age in (0,143,144,145):
            checked=trace(execution_request(signed,age=age))['execution']
            self.assertEqual(checked['success'],age>=144)
        self.assertEqual(trace(execution_request(signed,'sequence'))['execution']['error']['code'],'CSV_UNSATISFIED')
        req=request(True,'recovery');req['transaction']['inputs'][0]['sequence']='145';signed=trace(req)
        self.assertFalse(trace(execution_request(signed,age=144))['execution']['success'])
        self.assertTrue(trace(execution_request(signed,age=145))['execution']['success'])
        for sequence in ('4294967295',str(144|(1<<22)),'143'):
            req=request(True,'recovery');req['transaction']['inputs'][0]['sequence']=sequence
            self.assertFalse(trace(execution_request(trace(req),age=200))['execution']['success'])

    def test_witness_commitment_and_candidate_mining(self):
        for tree,path,count in [(False,'key',2),(True,'multisig',2),(True,'recovery',3),(True,'hashlock',3)]:
            signed=trace(request(tree,path,count));data=signed['transaction']
            candidate=trace(dict(kind='construction',network='mainnet',candidate=dict(hex=signed['steps'][0]['hex'],fee=data['fee'],budget=1000,height=840000,include=True,network='mainnet')))['candidate']
            self.assertIn('yours',candidate['selected']);self.assertIsNotNone(candidate['witnessCommitment'])
            self.assertIn(data['wtxid'],candidate['witnessCommitment']['wtxids'])
            mining=trace(dict(kind='mining',mining=dict(startNonce=0,difficulty='easy',count=1,merkleRoot=candidate['merkle']['root'])))['mining']
            self.assertEqual(mining['header'][72:136],candidate['merkle']['root_internal'])

    def test_reject_invalid_context_signature_encoding_and_single_range(self):
        for mode in (3,131):
            req=request(mode=mode,multiple=True);req['transaction']['outputs'].pop()
            for kwargs in ({},{'signTransaction':False,'previewSighash':True}):
                with self.assertRaises(ValueError):trace(dict(req,**kwargs))
        signed=trace(request());tx=Transaction.from_raw(signed['steps'][0]['hex'])
        locks=[Script.from_raw(s) for s in signed['transaction']['previousScripts']]
        raw=tx.serialize()
        self.assertTrue(trace_taproot_input(tx,0,locks,[100000])['success']);self.assertEqual(tx.serialize(),raw)
        for amount in (-1,True,'100000'):
            self.assertEqual(trace_taproot_input(tx,0,locks,[amount])['error']['code'],'INVALID_AMOUNT')
        for tail in ('00','04'):
            altered=Transaction.copy(tx);altered.witnesses[0].stack[0]+=tail
            self.assertFalse(trace_taproot_input(altered,0,locks,[100000])['success'])
        for source in ('bad',signed['transaction']['taproot'][0]['address'][:-1]+'q'):
            req=request();req['transaction']['inputs'][0]['source']=source
            with self.assertRaises(ValueError):trace(req)
        req=request();req['network']='testnet'
        with self.assertRaises(ValueError):trace(req)
        req=request();req['transaction']['inputs'][0]['internalKey']='00'*32
        with self.assertRaises(ValueError):trace(req)
        setup('mainnet')
        self.assertEqual(taproot_address_to_script(signed['transaction']['taproot'][0]['address']).to_hex(),locks[0].to_hex())


def wasm_vectors():
    vectors=[]
    def add(req):
        result=trace(req);vectors.append(dict(input=req,trace=result));return result
    for network in ('mainnet','testnet'):
        for tree,path,count in [(False,'key',2),(True,'key',2),(True,'multisig',2),(True,'recovery',2),(True,'hashlock',3)]:
            req=request(tree,path,count,network,multiple=not tree)
            add(dict(req,signTransaction=False));signed=add(req);add(dict(req,previewSighash=True))
            for exp in ('original','signature','output','amount')+ (() if path=='key' else ('control',)) + (('early','sequence') if path=='recovery' else ('secret',) if path=='hashlock' else ('order','missing') if path=='multisig' else ()):
                add(execution_request(signed,exp))
            data=signed['transaction']
            add(dict(kind='construction',network=network,candidate=dict(hex=signed['steps'][0]['hex'],fee=data['fee'],budget=1000,height=840000,include=True,network=network)))
    for mode in MODES:
        req=request(True,'multisig',mode=mode,multiple=True)
        signed=add(req);add(dict(req,previewSighash=True));add(execution_request(signed,'other-amount'))
    return vectors
