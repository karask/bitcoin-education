"""Native P2WSH m-of-3 multisig trace using core BIP143 digest APIs."""
import hashlib
import re

from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction, TxWitnessInput
from bitcoin_education.p2sh import multisig_redeem_script, _trace_multisig_script


def trace_p2wsh_input(transaction, input_index, previous_script_pubkey, amount):
    """Check SHA256(witnessScript), load witness data, and execute m-of-3.

    The scope is canonical compressed-key m-of-3, six BIP143 modes, NULLDUMMY,
    and a single true final item. Other scripts, full consensus/policy, and
    on-chain amounts/UTXOs are outside this evaluator. Inputs are not mutated.
    """
    stack, steps = [], []
    result = dict(script_type='p2wsh', sighash=None, checks=[], clean_stack=False)

    def fail(code, message):
        if steps:
            steps[-1]['error'] = message
        return dict(result, success=False, steps=steps, final_stack=[v.hex() for v in stack],
                    error=dict(code=code, message=message))

    def record(phase, instruction, operation, **extra):
        before = [v.hex() for v in stack]
        operation()
        steps.append(dict(phase=phase, instruction=instruction, stack_before=before,
                          stack_after=[v.hex() for v in stack], error=None, **extra))

    if not isinstance(transaction, Transaction):
        return fail('INVALID_TRANSACTION', 'Supply a Transaction instance.')
    if type(input_index) is not int or not 0 <= input_index < len(transaction.inputs):
        return fail('INVALID_INPUT_INDEX', 'Choose an input inside the transaction.')
    if type(amount) is not int or not 0 <= amount <= 21_000_000 * 100_000_000:
        return fail('INVALID_AMOUNT', 'Supply the previous amount in integer satoshis.')
    result['amount'] = amount
    if not isinstance(previous_script_pubkey, Script) or not re.fullmatch(r'0020[0-9a-f]{64}', previous_script_pubkey.to_hex()):
        return fail('UNSUPPORTED_SCRIPT', 'Use a native version-0 P2WSH locking script.')
    result['witness_program'] = previous_script_pubkey.to_hex()[4:]
    if transaction.inputs[input_index].script_sig.to_hex():
        return fail('NONEMPTY_SCRIPTSIG', 'Native P2WSH requires an empty scriptSig.')
    if not transaction.has_segwit:
        return fail('INVALID_WITNESS', 'Enable SegWit serialization.')
    if not isinstance(transaction.witnesses, list) or len(transaction.witnesses) != len(transaction.inputs):
        return fail('WITNESS_COUNT_MISMATCH', 'Provide one witness slot per transaction input.')
    witness = transaction.witnesses[input_index]
    if not isinstance(witness, TxWitnessInput) or not isinstance(witness.stack, list) or not witness.stack:
        return fail('INVALID_WITNESS', 'Reveal a witness script in the last witness item.')
    for value in witness.stack:
        if not isinstance(value, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2})*', value):
            return fail('INVALID_WITNESS_DATA', 'Witness items must contain complete hexadecimal bytes.')
    raw = bytes.fromhex(witness.stack[-1])
    result.update(witness_script=raw.hex(), script_code=raw.hex())
    if len(raw) > 10000 or any(len(bytes.fromhex(v)) > 520 for v in witness.stack[:-1]):
        return fail('WITNESS_ITEM_TOO_LARGE', 'Witness data items have a 520-byte limit; the script has a 10,000-byte limit.')
    actual_hash = hashlib.sha256(raw).hexdigest()
    record('witness program', 'CHECK_WITNESS_SCRIPT_HASH', lambda: None,
           kind='witness_commitment', hash=actual_hash, expected=result['witness_program'])
    if actual_hash != result['witness_program']:
        return fail('WITNESS_SCRIPT_HASH_MISMATCH', 'SHA256 of the revealed witness script does not match the previous output.')
    try:
        script, required, keys = multisig_redeem_script(raw.hex())
    except ValueError as error:
        return fail('UNSUPPORTED_WITNESS_SCRIPT', str(error).replace('redeem script', 'witness script'))
    result.update(required=required, public_keys=keys)
    # The last witness item selects the script; only earlier items initialize its stack.
    for index, value in enumerate(witness.stack[:-1]):
        record('witness', 'LOAD_DUMMY' if index == 0 else 'LOAD_SIGNATURE',
               lambda: stack.append(bytes.fromhex(value)), kind='witness_load')
    return _trace_multisig_script(transaction, input_index, script, required, keys, stack, steps, result, amount)


def p2wsh_address_to_script(address):
    """Decode v0/32-byte addresses with core Bech32 (0.8.7 drops constructor input)."""
    from bitcoinutils.bech32 import decode
    from bitcoinutils.constants import NETWORK_SEGWIT_PREFIXES
    from bitcoinutils.setup import get_network
    version, program = decode(NETWORK_SEGWIT_PREFIXES[get_network()], address)
    if version != 0 or program is None or len(program) != 32:
        raise ValueError('Use a checksummed version-0 address with a 32-byte program for this network.')
    return Script(['OP_0', bytes(program).hex()])
