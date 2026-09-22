import json
import unittest
from test_signing import vectors
from test_p2pkh import adapter


class ExecutionTests(unittest.TestCase):
    def test_signed_inputs_and_experiments(self):
        for vector in vectors():
            trace = vector['trace']
            for index, script in enumerate(trace['transaction']['previousScripts']):
                for experiment, error in [('original', None), ('key', 'EQUALVERIFY_FAILED'), ('signature', 'CHECKSIG_FAILED'), ('output', 'CHECKSIG_FAILED')]:
                    request = dict(kind='execution', execution=dict(hex=trace['steps'][0]['hex'], previousScript=script, inputIndex=index, experiment=experiment))
                    result = json.loads(adapter.trace_lesson(json.dumps(request)))['execution']
                    self.assertEqual(result['error']['code'] if result['error'] else None, error)
                    self.assertEqual(result['success'], error is None)
                    for before, after in zip(result['steps'], result['steps'][1:]):
                        self.assertEqual(before['stack_after'], after['stack_before'])
                    namespace = {}
                    exec(result['python'], namespace)
                    self.assertEqual(namespace['result']['steps'], result['steps'])

    def test_wrong_key_stops_at_equalverify(self):
        trace = vectors()[0]['trace']
        result = adapter.trace_execution(dict(execution=dict(hex=trace['steps'][0]['hex'], previousScript=trace['transaction']['previousScripts'][0], inputIndex=0, experiment='key')))['execution']
        self.assertEqual(result['error']['code'], 'EQUALVERIFY_FAILED')
        self.assertEqual(result['steps'][-1]['instruction'], 'OP_EQUALVERIFY')


def wasm_vectors():
    results = []
    for vector in vectors():
        trace = vector['trace']
        for index, script in enumerate(trace['transaction']['previousScripts']):
            for experiment in ['original', 'key', 'signature', 'output']:
                request = dict(kind='execution', execution=dict(hex=trace['steps'][0]['hex'], previousScript=script, inputIndex=index, experiment=experiment))
                results.append(dict(input=request, trace=json.loads(adapter.trace_lesson(json.dumps(request)))))
    return results
