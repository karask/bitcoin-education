"""A fixed P2WSH teaching template: real signatures, explicit BIP65/68/112/113 checks.

Chain context is supplied, not fetched. This is not a general Script interpreter or
full node validator. Transaction-only locks and script-required locks stay separate.
"""
from bitcoinutils.keys import PrivateKey, P2wshAddress
from bitcoinutils.script import Script
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Transaction, TxInput, TxOutput, TxWitnessInput
from ecdsa import SECP256k1, VerifyingKey
from ecdsa.util import sigdecode_der

THRESHOLD = 500_000_000
DISABLE = 1 << 31
TIME = 1 << 22
MASK = 0xffff
FINAL = 0xffffffff


def integer(value, label, maximum=FINAL):
    if type(value) is not str or not value.isascii() or not value.isdigit() or len(value) > 10:
        raise ValueError(f'{label}: enter a whole nonnegative decimal number.')
    number = int(value)
    if number > maximum:
        raise ValueError(f'{label}: maximum is {maximum}.')
    return number


def trace_timelocks(request):
    options = request.get('timelocks', {})
    if type(options) is not dict:
        raise ValueError('Supply timelock options.')
    mode, unit = options.get('mode'), options.get('unit')
    if mode not in ('locktime', 'sequence', 'cltv', 'csv'):
        raise ValueError('Choose an available timelock example.')
    relative = mode in ('sequence', 'csv')
    if unit not in (('blocks', 'time') if relative else ('height', 'time')):
        raise ValueError('Choose the lock’s matching height/time unit.')
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose mainnet or testnet.')
    value = integer(options.get('value'), 'Lock requirement', MASK if relative else FINAL)
    if not relative and ((unit == 'height' and value >= THRESHOLD) or (unit == 'time' and value < THRESHOLD)):
        raise ValueError('Absolute values below 500,000,000 are heights; values at or above it are timestamps.')
    version = integer(options.get('version'), 'Version', 2)
    if version not in (1, 2):
        raise ValueError('Use transaction version 1 or 2 in this lab.')
    locktime = integer(options.get('locktime'), 'nLockTime')
    sequence = integer(options.get('sequence'), 'nSequence')
    height = integer(options.get('height'), 'Candidate height')
    mtp = integer(options.get('mtp'), 'Previous block MTP')
    coin_height = integer(options.get('coinHeight'), 'UTXO confirmation height')
    coin_mtp = integer(options.get('coinMtp'), 'MTP before UTXO confirmation')
    if coin_height >= height or coin_mtp > mtp:
        raise ValueError('Use an already confirmed UTXO: its height must precede the candidate, and its prior MTP cannot exceed the current MTP.')
    operand = value | (TIME if relative and unit == 'time' else 0)
    setup(network)
    key = PrivateKey(secret_exponent=1)
    public_key = key.get_public_key().to_hex()
    tokens = ([operand, 'OP_CHECKLOCKTIMEVERIFY', 'OP_DROP'] if mode == 'cltv' else
              [operand, 'OP_CHECKSEQUENCEVERIFY', 'OP_DROP'] if mode == 'csv' else []) + [public_key, 'OP_CHECKSIG']
    witness_script = Script(tokens)
    previous_script = P2wshAddress(script=witness_script).to_script_pub_key()
    destination = PrivateKey(secret_exponent=2).get_public_key().get_segwit_address()
    tx = Transaction([TxInput('11' * 32, 0, sequence=sequence.to_bytes(4, 'little'))],
                     [TxOutput(99000, destination.to_script_pub_key())],
                     version=version.to_bytes(4, 'little'), locktime=locktime.to_bytes(4, 'little'), has_segwit=True)
    digest = tx.get_transaction_segwit_digest(0, witness_script, 100000)
    signature = key.sign_segwit_input(tx, 0, witness_script, 100000)
    tx.set_witness(0, TxWitnessInput([signature, witness_script.to_hex()]))
    signature_valid = VerifyingKey.from_string(bytes.fromhex(public_key), curve=SECP256k1).verify_digest(
        bytes.fromhex(signature)[:-1], digest, sigdecode=sigdecode_der)

    checks = []
    def check(label, passed, explanation, layer):
        checks.append(dict(label=label, passed=passed, explanation=explanation, layer=layer))
    if mode == 'cltv':
        check('CLTV units match', (operand < THRESHOLD) == (locktime < THRESHOLD),
              'The script operand and nLockTime must both be heights or both timestamps.', 'script')
        check('CLTV minimum is satisfied', locktime >= operand,
              f'nLockTime {locktime:,} must be at least script requirement {operand:,}.', 'script')
        check('Spending input is nonfinal', sequence != FINAL,
              'CLTV rejects this input’s final sequence 0xffffffff, which could disable nLockTime.', 'script')
    elif mode == 'csv':
        check('CSV uses version 2', version >= 2, 'CSV with this operand requires transaction version ≥ 2.', 'script')
        check('Sequence disable bit is clear', not sequence & DISABLE,
              'Bit 31 must be clear in the spending input’s nSequence.', 'script')
        check('CSV units match', bool(sequence & TIME) == bool(operand & TIME),
              'Bit 22 selects blocks (0) or 512-second time units (1).', 'script')
        check('CSV minimum is satisfied', (sequence & MASK) >= (operand & MASK),
              f'Masked sequence {sequence & MASK:,} must be at least requirement {operand & MASK:,}.', 'script')
    else:
        check('No script timelock requirement', True,
              'This key-only script does not require a delay. A key holder could sign another transaction with different lock fields.', 'script')
    check('Signature verifies', signature_valid,
          'The library signs this exact BIP143 digest with public learning key 1. Changing chain context does not change the digest.', 'signature')
    script_pass = all(c['passed'] for c in checks)

    # IsFinalTx: nLockTime is the last invalid height/time, with an all-final bypass.
    absolute_active = locktime != 0 and sequence != FINAL
    absolute_time = locktime >= THRESHOLD
    now = mtp if absolute_time else height
    absolute_pass = not absolute_active or locktime < now
    check('Absolute transaction finality', absolute_pass,
          (f'nLockTime {locktime:,} must be strictly below {"previous-block MTP" if absolute_time else "candidate height"} {now:,}.'
           if absolute_active else 'nLockTime is zero or this one input is final; absolute transaction locktime is inactive.'), 'chain')
    relative_active = version >= 2 and not sequence & DISABLE
    relative_time = bool(sequence & TIME)
    duration = (sequence & MASK) * (512 if relative_time else 1)
    first_relative = (coin_mtp if relative_time else coin_height) + duration
    relative_now = mtp if relative_time else height
    relative_pass = not relative_active or relative_now >= first_relative
    check('Relative transaction finality', relative_pass,
          (f'{"Previous-block MTP" if relative_time else "Candidate height"} {relative_now:,} must be at least {first_relative:,}: '
           f'{"MTP before confirmation" if relative_time else "confirmation height"} + {duration:,} {"seconds" if relative_time else "blocks"}.'
           if relative_active else 'Version < 2 or bit 31 is set; BIP68 relative sequence locking is inactive.'), 'chain')
    chain_pass = absolute_pass and relative_pass
    minimum_height = max(coin_height + 1, locktime + 1 if absolute_active and not absolute_time else 0,
                         first_relative if relative_active and not relative_time else 0)
    minimum_mtp = max(coin_mtp, locktime + 1 if absolute_active and absolute_time else 0,
                      first_relative if relative_active and relative_time else 0)

    code = ("from bitcoinutils.setup import setup\nfrom bitcoinutils.keys import PrivateKey, P2wshAddress\n"
            "from bitcoinutils.script import Script\nfrom bitcoinutils.transactions import Transaction, TxInput, TxOutput, TxWitnessInput\n\n"
            f"setup({network!r})\nkey = PrivateKey(secret_exponent=1)\n"
            f"witness_script = Script({tokens!r})\nprevious_script = P2wshAddress(script=witness_script).to_script_pub_key()\n"
            "destination = PrivateKey(secret_exponent=2).get_public_key().get_segwit_address()\n"
            f"tx = Transaction([TxInput({'11' * 32!r}, 0, sequence=({sequence}).to_bytes(4, 'little'))],\n"
            f"    [TxOutput(99000, destination.to_script_pub_key())], version=({version}).to_bytes(4, 'little'),\n"
            f"    locktime=({locktime}).to_bytes(4, 'little'), has_segwit=True)\n"
            "signature = key.sign_segwit_input(tx, 0, witness_script, 100000)\n"
            "tx.set_witness(0, TxWitnessInput([signature, witness_script.to_hex()]))\n"
            "print(tx.serialize())\n")
    result = dict(mode=mode, unit=unit, operand=operand, checks=checks, scriptPass=script_pass,
                  chainPass=chain_pass, eligible=script_pass and chain_pass, minimumHeight=minimum_height, minimumMtp=minimum_mtp,
                  absoluteActive=absolute_active, relativeActive=relative_active, sequence=sequence, locktime=locktime,
                  sequenceHex=sequence.to_bytes(4, 'little').hex(), locktimeHex=locktime.to_bytes(4, 'little').hex(),
                  disableBit=bool(sequence & DISABLE), timeBit=bool(sequence & TIME), masked=sequence & MASK,
                  effectiveDelay=duration, script=witness_script.to_hex(), assembly=' '.join(map(str, tokens)),
                  address=P2wshAddress(script=witness_script).to_string(), previousScript=previous_script.to_hex(),
                  signature=signature, digest=digest.hex(), hex=tx.serialize(), txid=tx.get_txid(), wtxid=tx.get_wtxid(),
                  vsize=tx.get_vsize(), fee=1000, python=code)
    return dict(network=network, compressed=True, publicKey=public_key, address=result['address'], steps=[],
                pythonPreamble='', timelocks=result)
