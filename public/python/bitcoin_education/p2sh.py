"""Scoped legacy P2SH m-of-3 multisig teaching trace, built on core APIs."""
import hashlib
import re

from ecdsa import BadSignatureError
from ecdsa.der import UnexpectedDER
from ecdsa.util import sigdecode_der
from bitcoinutils.keys import PublicKey
from bitcoinutils.ripemd160 import ripemd160
from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction

MODES = {1: 'SIGHASH_ALL', 2: 'SIGHASH_NONE', 3: 'SIGHASH_SINGLE',
         129: 'SIGHASH_ALL | ANYONECANPAY', 130: 'SIGHASH_NONE | ANYONECANPAY',
         131: 'SIGHASH_SINGLE | ANYONECANPAY'}


def multisig_redeem_script(raw):
    """Validate the canonical compressed-key m-of-3 rule used by Addresses."""
    if not isinstance(raw, str):
        raise ValueError('Supply the multisig redeem script as hexadecimal bytes.')
    raw = ''.join(raw.split()).lower().removeprefix('0x')
    if not re.fullmatch(r'5[123](?:21(?:02|03)[0-9a-f]{64}){3}53ae', raw):
        raise ValueError('Use a 1, 2, or 3-of-3 redeem script with three compressed keys and OP_CHECKMULTISIG.')
    keys = [raw[4 + i * 68:70 + i * 68] for i in range(3)]
    for key in keys:
        try:
            PublicKey(key)
        except (ValueError, AssertionError) as error:
            raise ValueError('The redeem script contains an invalid public key.') from error
    if len(set(keys)) != 3:
        raise ValueError('Use three distinct public keys in the redeem script.')
    return Script.from_raw(raw), int(raw[1]), keys


def trace_p2sh_input(transaction, input_index, previous_script_pubkey):
    """Trace push-only scriptSig, hash check, restored stack, and CHECKMULTISIG.

    Supports canonical compressed-key m-of-3 redeem scripts and the six legacy
    sighash modes. Enforces NULLDUMMY; other script forms and node policy are
    outside this teaching evaluator. Does not mutate caller objects.
    """
    stack, steps = [], []
    result = dict(script_type='p2sh', sighash=None, checks=[])

    def finish(error=None):
        return dict(result, success=error is None, steps=steps,
                    final_stack=[value.hex() for value in stack], error=error)

    def fail(code, message):
        if steps:
            steps[-1]['error'] = message
        return finish(dict(code=code, message=message))

    def record(phase, instruction, operation, **extra):
        before = [value.hex() for value in stack]
        operation()
        steps.append(dict(phase=phase, instruction=instruction, stack_before=before,
                          stack_after=[value.hex() for value in stack], error=None, **extra))

    if not isinstance(transaction, Transaction):
        return fail('INVALID_TRANSACTION', 'Supply a Transaction instance.')
    if type(input_index) is not int or not 0 <= input_index < len(transaction.inputs):
        return fail('INVALID_INPUT_INDEX', 'Choose an input inside the transaction.')
    if not isinstance(previous_script_pubkey, Script) or not re.fullmatch(r'a914[0-9a-f]{40}87', previous_script_pubkey.to_hex()):
        return fail('UNSUPPORTED_SCRIPT', 'Use a standard P2SH previous locking script.')
    tokens = transaction.inputs[input_index].script_sig.get_script()
    if not tokens:
        return fail('UNSUPPORTED_SCRIPTSIG', 'Reveal signatures and a redeem script in scriptSig.')
    for index, token in enumerate(tokens):
        if token == 'OP_0' or token == 0:
            value = b''
        elif isinstance(token, str) and re.fullmatch(r'OP_(?:[1-9]|1[0-6])', token):
            value = bytes([int(token[3:])])
        elif isinstance(token, int) and 1 <= token <= 16:
            value = bytes([token])
        elif isinstance(token, str) and re.fullmatch(r'(?:[0-9a-fA-F]{2})*', token):
            value = bytes.fromhex(token)
        else:
            return fail('SIG_PUSHONLY', 'P2SH requires a push-only scriptSig.')
        if len(value) > 520:
            return fail('PUSH_SIZE', 'A pushed element cannot exceed 520 bytes.')
        instruction = ('PUSH_REDEEM_SCRIPT' if index == len(tokens) - 1 else
                       f'OP_{int.from_bytes(value, "little")}' if index == 0 and len(value) <= 1 else
                       'PUSH_SIGNATURE')
        record('scriptSig', instruction, lambda: stack.append(value))
    saved = list(stack)
    redeem_bytes = stack[-1]
    result['redeem_script'] = redeem_bytes.hex()
    expected = bytes.fromhex(previous_script_pubkey.to_hex()[4:44])
    record('scriptPubKey', 'OP_HASH160', lambda: stack.append(ripemd160(hashlib.sha256(stack.pop()).digest())))
    record('scriptPubKey', 'PUSH_SCRIPT_HASH', lambda: stack.append(expected))
    right, left = stack[-1], stack[-2]
    record('scriptPubKey', 'OP_EQUAL', lambda: (stack.pop(), stack.pop(), stack.append(b'\x01' if left == right else b'')))
    if left != right:
        return fail('SCRIPT_HASH_MISMATCH', 'The revealed redeem script does not match the previous P2SH commitment.')
    try:
        redeem, required, keys = multisig_redeem_script(redeem_bytes.hex())
    except ValueError as error:
        return fail('UNSUPPORTED_REDEEM_SCRIPT', str(error))
    result.update(required=required, public_keys=keys)
    # BIP16 restores the stack saved after scriptSig, then removes its script.
    record('P2SH validation', 'RESTORE_STACK', lambda: stack.__setitem__(slice(None), saved[:-1]))
    return _trace_multisig_script(transaction, input_index, redeem, required, keys, stack, steps, result)


def _trace_multisig_script(transaction, input_index, redeem, required, keys, stack, steps, result, amount=None):
    """Shared scoped CHECKMULTISIG engine; SegWit uses the same rule with BIP143."""
    phase = 'witnessScript' if amount is not None else 'redeemScript'

    def finish(error=None):
        if amount is not None:
            result['clean_stack'] = error is None and stack == [b'\x01']
        return dict(result, success=error is None, steps=steps,
                    final_stack=[value.hex() for value in stack], error=error)

    def fail(code, message):
        if steps:
            steps[-1]['error'] = message
        return finish(dict(code=code, message=message))

    def record(phase, instruction, operation, **extra):
        before = [value.hex() for value in stack]
        operation()
        steps.append(dict(phase=phase, instruction=instruction, stack_before=before,
                          stack_after=[value.hex() for value in stack], error=None, **extra))

    if len(stack) != required + 1:
        return fail('SIGNATURE_COUNT', f'This teaching example requires an empty dummy and exactly {required} signatures.')
    signatures, dummy = list(stack[1:]), stack[0]
    record(phase, f'OP_{required}', lambda: stack.append(bytes([required])))
    for key in keys:
        record(phase, 'PUSH_PUBLIC_KEY', lambda: stack.append(bytes.fromhex(key)))
    record(phase, 'OP_3', lambda: stack.append(b'\x03'))
    checks = []
    next_key, valid = 0, True
    for signature_index, signature in enumerate(signatures):
        if not signature:
            valid = False
            break
        mode = signature[-1]
        if mode not in MODES:
            record(phase, 'OP_CHECKMULTISIG', lambda: None)
            return fail('UNSUPPORTED_SIGHASH', 'Use ALL, NONE, SINGLE, or an ANYONECANPAY variant.')
        if amount is None:
            digest = transaction.get_transaction_digest(input_index, redeem, mode)
        else:
            from bitcoin_education.sighash import trace_segwit_v0_sighash
            digest = bytes.fromhex(trace_segwit_v0_sighash(transaction, input_index, redeem, amount, mode)['digest'])
        result['sighash'] = MODES[mode]
        try:
            # Verify DER structure before treating a mathematically wrong signature as false.
            sigdecode_der(signature[:-1], PublicKey(keys[0]).key.curve.order)
        except (UnexpectedDER, ValueError, IndexError, TypeError) as error:
            record(phase, 'OP_CHECKMULTISIG', lambda: None)
            return fail('INVALID_DER_SIGNATURE', str(error))
        matched = False
        while next_key < len(keys):
            key_index = next_key
            next_key += 1
            try:
                matched = PublicKey(keys[key_index]).key.verify_digest(signature[:-1], digest, sigdecode=sigdecode_der)
            except (BadSignatureError, ValueError, AssertionError):
                matched = False
            checks.append(dict(signature=signature_index + 1, publicKey=key_index + 1,
                               digest=digest.hex(), sighash=MODES[mode], valid=matched))
            if matched:
                break
            if len(keys) - next_key < len(signatures) - signature_index:
                break
        if not matched:
            valid = False
            break
    result['checks'] = checks
    if dummy:
        record(phase, 'OP_CHECKMULTISIG', lambda: None, checks=checks)
        return fail('NULLDUMMY', 'CHECKMULTISIG consumes an extra dummy item, which must be empty bytes.')
    record(phase, 'OP_CHECKMULTISIG', lambda: stack.__setitem__(slice(None), [b'\x01' if valid else b'']),
           checks=checks, signature_valid=valid, **({'digest': checks[0]['digest']} if checks else {}))
    if not valid:
        return fail('CHECKMULTISIG_FAILED', f'The signatures do not satisfy the {"witness" if amount is not None else "redeem"} script in public-key order.')
    return finish()
