"""Exercise the migrated helper API in CPython and WebAssembly with identical inputs."""
import json

from bitcoin_education import (
    create_segwit_coinbase_transaction, trace_p2wpkh_input, trace_segwit_v0_sighash,
)
from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction, TxOutput


def run(request_json):
    request = json.loads(request_json)
    transaction = Transaction.from_raw(request['hex'])
    if request['kind'] == 'coinbase':
        coinbase, trace = create_segwit_coinbase_transaction(
            840000, [TxOutput(312501000, Script(['OP_1']))],
            transactions=[transaction], fees=1000, extra_nonce=b'\x01',
        )
        result = {'hex': coinbase.to_hex(), 'trace': trace}
    elif request['kind'] == 'execution':
        result = trace_p2wpkh_input(transaction, request['index'], Script.from_raw(request['script']), request['amount'])
    else:
        result = trace_segwit_v0_sighash(transaction, request['index'], Script.from_raw(request['script']), request['amount'], request['mode'])
    return json.dumps(result)


def vectors():
    from test_native_transactions import request
    from test_transactions import trace
    results = []
    for mode in (1, 2, 3, 129, 130, 131):
        draft = request(multiple=True)
        draft['transaction']['inputs'][1]['sighashType'] = mode
        signed = trace(draft)
        data = signed['transaction']
        seed = dict(hex=signed['steps'][0]['hex'], index=1, amount=50000, mode=mode)
        for kind, script, amount in (
            ('execution', data['previousScripts'][1], 50000),
            ('execution', data['previousScripts'][1], 50001),
            ('sighash', data['scriptCodes'][1], 50000),
            ('coinbase', '', 50000),
        ):
            req = dict(seed, kind=kind, script=script, amount=amount)
            results.append(dict(input=req, result=json.loads(run(json.dumps(req)))))
    return results
