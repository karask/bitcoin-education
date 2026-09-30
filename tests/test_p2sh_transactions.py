"""Legacy P2SH multisig: independent wire/preimages, ordered signatures, and journey."""
import copy
import contextlib
import io
import itertools
import unittest

from test_transactions import trace
from test_signing import double_sha
from test_native_journey import candidate_request, fold_hashes
from bitcoinutils.keys import PrivateKey, P2shAddress, PublicKey
from bitcoinutils.script import Script
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Transaction
from bitcoin_education import trace_p2sh_input
from bitcoin_education.p2sh import multisig_redeem_script
from ecdsa.util import sigdecode_der

KEYS = [PrivateKey(secret_exponent=n).get_public_key().to_hex() for n in (1, 2, 3)]


def request(network='mainnet', threshold=2, sign=True, multiple=False, signers=None):
    setup(network)
    redeem = Script([f'OP_{threshold}', *KEYS, 'OP_3', 'OP_CHECKMULTISIG'])
    recipient = Script(['OP_1', *KEYS, 'OP_3', 'OP_CHECKMULTISIG'])
    address = P2shAddress(script=redeem).to_string()
    row = dict(txid='0123456789abcdef'*4, vout='0', amount='100000', sourceType='address', source=address,
               redeemScript=redeem.to_hex(), signerKeys=[f'{n:064x}' for n in (signers or range(1, threshold + 1))])
    rows = [row]
    if multiple:
        rows.append(dict(row, txid='ab'*32, vout='1', amount='50000', signerKeys=list(reversed(row['signerKeys']))))
    return dict(kind='transaction', network=network, signTransaction=sign, transaction=dict(spendType='p2sh', inputs=rows,
        outputs=[dict(address=P2shAddress(script=recipient).to_string(), amount='60000'),
                 dict(address=address, amount='89000' if multiple else '39000')]))


def execution_request(signed, index=0, experiment='original'):
    return dict(kind='execution', network=signed['network'], execution=dict(hex=signed['steps'][0]['hex'],
        spendType='p2sh', previousScript=signed['transaction']['previousScripts'][index], inputIndex=index, experiment=experiment))


class P2shTransactionTests(unittest.TestCase):
    def test_unsigned_wire_and_address_lesson_rule(self):
        for network in ('mainnet', 'testnet'):
            req = request(network, sign=False)
            data = trace(req)
            script = bytes.fromhex(data['transaction']['previousScripts'][0])
            recipient = P2shAddress(address=req['transaction']['outputs'][0]['address']).to_script_pub_key().to_bytes()
            expected = (bytes.fromhex('0200000001' + 'efcdab8967452301'*4 + '0000000000ffffffff02')
                        + (60000).to_bytes(8,'little') + bytes([23]) + recipient
                        + (39000).to_bytes(8,'little') + bytes([23]) + script + bytes(4))
            self.assertEqual(data['steps'][0]['hex'], expected.hex())
            self.assertEqual(data['transaction']['scriptCodes'][0], req['transaction']['inputs'][0]['redeemScript'])
            self.assertFalse(data['transaction']['hasWitness'])
            from test_p2sh import trace as address_trace
            self.assertEqual(req['transaction']['inputs'][0]['source'], address_trace(network)['address'])

    def test_signer_subsets_ordering_fields_ids_and_runnable_python(self):
        for network in ('mainnet', 'testnet'):
            for threshold in (1,2,3):
                for signers in itertools.combinations((1,2,3),threshold):
                    req=request(network,threshold,multiple=True,signers=signers[::-1])
                    signed=trace(req)
                    data=signed['transaction']
                    raw=bytes.fromhex(signed['steps'][0]['hex'])
                    self.assertEqual(data['txid'], double_sha(raw)[::-1].hex())
                    self.assertEqual(data['txid'],data['wtxid'])
                    self.assertNotEqual(data['txid'],data['signing']['unsignedTxid'])
                    self.assertEqual(data['weight'],len(raw)*4)
                    self.assertEqual(data['vsize'],len(raw))
                    self.assertEqual([j for f in data['fields'] for j in range(f['start'],f['end'])],list(range(len(raw))))
                    for index,item in enumerate(data['signing']['inputs']):
                        self.assertEqual(item['signerIndexes'],list(signers))
                        self.assertTrue(item['scriptSig'].endswith('4c69'+item['redeemScript']))
                        script=bytes.fromhex(item['scriptSig'])
                        self.assertEqual(script[0],0)
                        for sig,key in zip(item['signatures'],item['publicKeys']):
                            self.assertTrue(PublicKey(key).key.verify_digest(bytes.fromhex(sig)[:-1],bytes.fromhex(item['digest']),sigdecode=sigdecode_der))
                        execution=trace(execution_request(signed,index))['execution']
                        self.assertTrue(execution['success'],execution['error'])
                        self.assertEqual(execution['final_stack'],['01'])
                        self.assertEqual(execution['required'],threshold)
                        for left,right in zip(execution['steps'],execution['steps'][1:]):
                            self.assertEqual(left['stack_after'],right['stack_before'])
                        ns={};exec(execution['python'],ns)
                        self.assertEqual(ns['result']['steps'],execution['steps'])
                    ns={}
                    with contextlib.redirect_stdout(io.StringIO()): exec(data['python'],ns)
                    self.assertEqual(ns['raw_hex'],signed['steps'][0]['hex'])

    def test_sighash_preimages_and_experiments(self):
        for mode in (1,2,3,129,130,131):
            req=request(multiple=True)
            for row in req['transaction']['inputs']: row['sighashType']=mode
            preview=trace(dict(req,previewSighash=True))['sighash']
            signed=trace(req)
            for index,item in enumerate(signed['transaction']['signing']['inputs']):
                pre=preview['inputs'][index]
                self.assertEqual(pre['digest'],double_sha(bytes.fromhex(pre['preimage'])).hex())
                self.assertEqual(pre['digest'],item['digest'])
                # Independent legacy wire signing copy, with redeemScript (not P2SH wrapper).
                base=mode&31;anyone=bool(mode&128)
                rows=req['transaction']['inputs'];outputs=req['transaction']['outputs']
                chosen=[index] if anyone else range(len(rows))
                raw=bytes.fromhex('02000000')+bytes([len(chosen)])
                for i in chosen:
                    row=rows[i];script=bytes.fromhex(row['redeemScript']) if i==index else b''
                    seq=bytes(4) if base in (2,3) and i!=index else bytes.fromhex('ffffffff')
                    raw+=bytes.fromhex(row['txid'])[::-1]+int(row['vout']).to_bytes(4,'little')+bytes([len(script)])+script+seq
                chosen_outputs=outputs if base==1 else [] if base==2 else [None]*index+[outputs[index]]
                raw+=bytes([len(chosen_outputs)])
                for out in chosen_outputs:
                    if out is None:raw+=bytes.fromhex('ffffffffffffffff00')
                    else:
                        script=P2shAddress(address=out['address']).to_script_pub_key().to_bytes()
                        raw+=int(out['amount']).to_bytes(8,'little')+bytes([len(script)])+script
                raw+=bytes(4)+mode.to_bytes(4,'little')
                self.assertEqual(pre['preimage'],raw.hex())
                for experiment in ('original','signature','key','output','order','missing','dummy'):
                    result=trace(execution_request(signed,index,experiment))['execution']
                    succeeds=experiment=='original' or experiment=='output' and (base==2 or base==3 and index!=0)
                    self.assertEqual(result['success'],succeeds,(index,mode,experiment,result['error']))
                    if experiment=='key': self.assertEqual(result['error']['code'],'SCRIPT_HASH_MISMATCH')
                    if experiment=='dummy': self.assertEqual(result['error']['code'],'NULLDUMMY')
                    if experiment=='missing': self.assertEqual(result['error']['code'],'SIGNATURE_COUNT')

    def test_candidate_selection_and_mining(self):
        signed=trace(request())
        candidate=trace(candidate_request(signed,budget=1000))['candidate']
        self.assertIn('yours',candidate['selected'])
        self.assertIsNone(candidate['witnessCommitment'])
        yours=next(e for e in candidate['entries'] if e['id']=='yours')
        self.assertFalse(yours['hasWitness'])
        self.assertEqual(yours['vsize'],signed['transaction']['vsize'])
        self.assertEqual(candidate['merkle']['root_internal'],fold_hashes(candidate['merkle']['txids']).hex())
        mined=trace(dict(kind='mining',mining=dict(merkleRoot=candidate['merkle']['root'],count=1)))['mining']
        self.assertEqual(mined['header'][72:136],candidate['merkle']['root_internal'])

    def test_invalid_redeem_scripts_signers_and_pushonly(self):
        for update in (dict(redeemScript=''),dict(redeemScript=request()['transaction']['inputs'][0]['redeemScript'].replace('52','51',1)),
                       dict(signerKeys=[]),dict(signerKeys=['1'.zfill(64)]*2),dict(signerKeys=['1'.zfill(64),'4'.zfill(64)]),
                       dict(signerKeys=['zz'*32,'2'.zfill(64)]),dict(signerKeys=[None])):
            req=request();req['transaction']['inputs'][0].update(update)
            with self.assertRaises(ValueError):trace(req)
        for raw in (None,'52','52'+'21'+'02'+'ff'*32):
            with self.assertRaises(ValueError):multisig_redeem_script(raw)
        signed=trace(request());tx=Transaction.from_raw(signed['steps'][0]['hex']);lock=Script.from_raw(signed['transaction']['previousScripts'][0])
        tx.inputs[0].script_sig.script.insert(0,'OP_DUP')
        self.assertEqual(trace_p2sh_input(tx,0,lock)['error']['code'],'SIG_PUSHONLY')

    def test_structured_encoding_failures_and_no_mutation(self):
        signed=trace(request())
        tx=Transaction.from_raw(signed['steps'][0]['hex'])
        lock=Script.from_raw(signed['transaction']['previousScripts'][0])
        before=tx.serialize()
        self.assertTrue(trace_p2sh_input(tx,0,lock)['success'])
        self.assertEqual(tx.serialize(),before)
        for value,expected in [('300001','INVALID_DER_SIGNATURE'),('','CHECKMULTISIG_FAILED'),
                               (tx.inputs[0].script_sig.script[1][:-2]+'04','UNSUPPORTED_SIGHASH')]:
            altered=Transaction.copy(tx)
            altered.inputs[0].script_sig.script[1]=value
            self.assertEqual(trace_p2sh_input(altered,0,lock)['error']['code'],expected)
        for index in (-1,True,1):
            self.assertEqual(trace_p2sh_input(tx,index,lock)['error']['code'],'INVALID_INPUT_INDEX')
        invalid='52'+'21'+'02'+'ff'*32+''.join('21'+key for key in KEYS[1:])+'53ae'
        with self.assertRaises(ValueError):multisig_redeem_script(invalid)

    def test_changed_public_key_order_controls_signature_order(self):
        req=request(signers=(1,2))
        row=req['transaction']['inputs'][0]
        redeem=Script(['OP_2',KEYS[1],KEYS[2],KEYS[0],'OP_3','OP_CHECKMULTISIG'])
        row.update(redeemScript=redeem.to_hex(),source=P2shAddress(script=redeem).to_string())
        signed=trace(req)
        item=signed['transaction']['signing']['inputs'][0]
        self.assertEqual(item['publicKeys'],[KEYS[1],KEYS[0]])
        self.assertEqual(item['signerIndexes'],[1,3])
        execution=trace(execution_request(signed))['execution']
        self.assertTrue(execution['success'])
        self.assertEqual([check['valid'] for check in execution['checks']],[True,False,True])

    def test_previous_script_metadata_amount_and_single_bounds(self):
        req=request()
        original=trace(req)
        req['transaction']['inputs'][0].update(sourceType='script',source=original['transaction']['previousScripts'][0],amount='100001')
        self.assertEqual(trace(req)['steps'][0]['hex'],original['steps'][0]['hex'])
        req=request(multiple=True)
        req['transaction']['outputs'].pop()
        req['transaction']['inputs'][1]['sighashType']=3
        for preview in (True,False):
            with self.assertRaisesRegex(ValueError,'SIGHASH_SINGLE needs output 2'):
                trace(dict(req,previewSighash=preview))


def wasm_vectors():
    vectors=[]
    for network in ('mainnet','testnet'):
        for threshold in (1,2,3):
            req=request(network,threshold,multiple=True)
            vectors += [dict(input=req,trace=trace(req)),dict(input=dict(req,signTransaction=False),trace=trace(dict(req,signTransaction=False)))]
    for mode in (1,2,3,129,130,131):
        req=request(multiple=True);req['transaction']['inputs'][1]['sighashType']=mode
        preview=dict(req,previewSighash=True);vectors.append(dict(input=preview,trace=trace(preview)))
        signed=trace(req)
        for experiment in ('original','signature','key','output','order','missing','dummy'):
            req=execution_request(signed,1,experiment);vectors.append(dict(input=req,trace=trace(req)))
    req=candidate_request(trace(request()),budget=1000);vectors.append(dict(input=req,trace=trace(req)))
    return vectors
