"""P2SH-P2WPKH: outer script commitment followed by SegWit v0 validation."""
import re

from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction
from bitcoinutils.ripemd160 import ripemd160
from bitcoinutils.schnorr import hash_sha256
from bitcoin_education.p2wpkh import trace_p2wpkh_input


def trace_nested_p2wpkh_input(transaction, input_index, previous_script_pubkey, amount):
    """Validate the single pushed witness program, then trace its P2WPKH witness.

    This evaluator operates on core Script/Transaction objects, whose raw parser
    normalizes data pushes; it does not establish raw-byte canonicality or full
    node consensus/policy. Other P2SH witness programs are outside its scope.
    """
    stack, steps = [], []
    metadata = dict(script_type='nested', sighash=None, clean_stack=False)

    def fail(code, message):
        if steps:
            steps[-1]['error'] = message
        return dict(metadata, success=False, steps=steps, final_stack=[v.hex() for v in stack],
                    error=dict(code=code, message=message))

    def record(phase, instruction, operation):
        before = [v.hex() for v in stack]
        operation()
        steps.append(dict(phase=phase, instruction=instruction, stack_before=before,
                          stack_after=[v.hex() for v in stack], error=None))

    if not isinstance(transaction, Transaction):
        return fail('INVALID_TRANSACTION', 'Supply a Transaction instance.')
    if type(input_index) is not int or not 0 <= input_index < len(transaction.inputs):
        return fail('INVALID_INPUT_INDEX', 'Choose an input inside the transaction.')
    if not isinstance(previous_script_pubkey, Script) or not re.fullmatch(r'a914[0-9a-f]{40}87', previous_script_pubkey.to_hex()):
        return fail('UNSUPPORTED_SCRIPT', 'Use a standard P2SH previous locking script.')
    script_sig = transaction.inputs[input_index].script_sig
    tokens = script_sig.get_script()
    if len(tokens) != 1 or not isinstance(tokens[0], str) or not re.fullmatch(r'0014[0-9a-fA-F]{40}', tokens[0]):
        return fail('INVALID_NESTED_SCRIPTSIG', 'scriptSig must contain only a push of the 22-byte P2WPKH redeem program.')
    redeem = bytes.fromhex(tokens[0])
    metadata['redeem_script'] = redeem.hex()
    record('scriptSig', 'PUSH_REDEEM_SCRIPT', lambda: stack.append(redeem))
    record('scriptPubKey', 'OP_HASH160', lambda: stack.append(ripemd160(hash_sha256(stack.pop()))))
    expected = bytes.fromhex(previous_script_pubkey.to_hex()[4:44])
    record('scriptPubKey', 'PUSH_SCRIPT_HASH', lambda: stack.append(expected))
    matches = stack[-2] == stack[-1]
    record('scriptPubKey', 'OP_EQUAL', lambda: stack.__setitem__(slice(None), [b'\x01' if matches else b'']))
    if not matches:
        return fail('SCRIPT_HASH_MISMATCH', 'The redeem-program HASH160 does not match the outer P2SH commitment.')
    record('SegWit validation', 'SELECT_WITNESS_PROGRAM', lambda: stack.clear())
    # BIP143 does not hash scriptSigs. Clear only the copied input so the shared
    # native evaluator can check the same witness/program/digest without mutation.
    checking = Transaction.copy(transaction)
    checking.inputs[input_index].script_sig = Script([])
    inner = trace_p2wpkh_input(checking, input_index, Script.from_raw(redeem.hex()), amount)
    return dict(inner, script_type='nested', redeem_script=redeem.hex(), steps=steps + inner['steps'])
