"""Sign frontend funding plans and independently execute each input's spending condition."""
import json
import sys
from python_test_support import adapter
from test_native_transactions import parse_wire

vectors = json.load(sys.stdin)
for vector in vectors:
    req, quote = vector['input'], vector['q']
    signed = json.loads(adapter.trace_lesson(json.dumps(req)))
    data = signed['transaction']
    raw = bytes.fromhex(signed['steps'][0]['hex'])
    base, _, outputs, _ = parse_wire(raw)
    actual_size = (len(base) * 3 + len(raw) + 3) // 4
    assert actual_size == data['vsize'] <= quote['vsize'], (req['transaction']['spendType'], actual_size, quote['vsize'])
    assert data['fee'] == quote['fee']
    assert len(outputs) == (2 if quote['hasChange'] else 1)
    assert sum(int(i['amount']) for i in req['transaction']['inputs']) == sum(int(o['amount']) for o in req['transaction']['outputs']) + data['fee']
    for index in range(len(req['transaction']['inputs'])):
        execution = dict(kind='execution', network=req['network'], execution=dict(
            hex=raw.hex(), previousScript=data['previousScripts'][index], amount=data['previousAmounts'][index],
            previousScripts=data['previousScripts'], amounts=data['previousAmounts'], inputIndex=index,
            spendType=data['spendType'], experiment='original'))
        result = json.loads(adapter.trace_lesson(json.dumps(execution)))
        assert result['execution']['success'], (data['spendType'], index, result['execution']['error'])
print(json.dumps(dict(checked=len(vectors))))
