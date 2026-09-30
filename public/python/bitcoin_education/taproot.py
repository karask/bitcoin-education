"""Taproot teaching helpers: core crypto, exact BIP341 messages, three fixed leaves.

This is a scoped evaluator, not a complete consensus interpreter. No annex,
OP_CODESEPARATOR, upgrade leaf versions or arbitrary Tapscript are supported.
UTXO amounts, locks and block ages are caller-supplied educational metadata.
"""
import hashlib
import re

from bitcoinutils.keys import PrivateKey, PublicKey, P2trAddress
from bitcoinutils.script import Script
from bitcoinutils.transactions import Transaction, TxInput, TxOutput, TxWitnessInput
from bitcoinutils.utils import (ControlBlock, calculate_tweak, encode_varint,
                               get_tag_hashed_merkle_root, tagged_hash,
                               tapleaf_tagged_hash, tapbranch_tagged_hash,
                               tweak_taproot_pubkey)
from bitcoinutils.schnorr import schnorr_verify
from bitcoinutils.setup import setup, get_network
from bitcoinutils.bech32 import decode
from bitcoinutils.constants import NETWORK_SEGWIT_PREFIXES

MODES = {0: 'SIGHASH_DEFAULT', 1: 'SIGHASH_ALL', 2: 'SIGHASH_NONE', 3: 'SIGHASH_SINGLE',
         129: 'SIGHASH_ALL | ANYONECANPAY', 130: 'SIGHASH_NONE | ANYONECANPAY',
         131: 'SIGHASH_SINGLE | ANYONECANPAY'}
SECRET = bytes.fromhex('62697420627920626974')
# Public keys for disposable, publicly known scalars. Building needs no secrets.
PUBLIC_KEYS = [
    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    'c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
    'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
    'e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13',
    '2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4',
    'fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556',
]


def taproot_template(leaf_count=2):
    if type(leaf_count) is not int or leaf_count not in (2, 3):
        raise ValueError('Choose two or three script leaves.')
    keys = PUBLIC_KEYS
    leaves = [
        Script([keys[1], 'OP_CHECKSIG', keys[2], 'OP_CHECKSIGADD', keys[3], 'OP_CHECKSIGADD', 'OP_2', 'OP_NUMEQUAL']),
        Script([144, 'OP_CHECKSEQUENCEVERIFY', 'OP_DROP', keys[4], 'OP_CHECKSIG']),
        Script(['OP_SHA256', hashlib.sha256(SECRET).hexdigest(), 'OP_EQUALVERIFY', keys[5], 'OP_CHECKSIG']),
    ][:leaf_count]
    tree = leaves if leaf_count == 2 else [leaves[0], [leaves[1], leaves[2]]]
    return PublicKey('02' + keys[0]), leaves, tree


def taproot_address_to_script(address):
    version, program = decode(NETWORK_SEGWIT_PREFIXES[get_network()], address)
    if version != 1 or program is None or len(program) != 32:
        raise ValueError('Use a checksummed Bech32m version-1 address with a 32-byte program for this network.')
    return Script(['OP_1', bytes(program).hex()])


def mode_for(row, index, outputs):
    mode = row.get('sighashType', 0)
    if type(mode) is not int or mode not in MODES:
        raise ValueError(f'Input {index + 1}: choose a supported Taproot SIGHASH mode.')
    if mode & 3 == 3 and index >= outputs:
        raise ValueError(f'Input {index + 1}: Taproot SINGLE requires a matching output.')
    return mode


def trace_taproot_sighash(tx, index, scripts, amounts, mode=0, script=None):
    """Annotate epoch || SigMsg || BIP342 extension; assert core digest parity."""
    if type(mode) is not int or mode not in MODES:
        raise ValueError('Unsupported Taproot SIGHASH mode.')
    if len(scripts) != len(tx.inputs) or len(amounts) != len(tx.inputs):
        raise ValueError('Supply the previous locking script and amount for every input.')
    if not 0 <= index < len(tx.inputs) or (mode & 3 == 3 and index >= len(tx.outputs)):
        raise ValueError('Input or matching SINGLE output is out of range.')
    if any(type(a) is not int or not 0 <= a <= 21_000_000 * 100_000_000 for a in amounts):
        raise ValueError('Previous amounts must be integer satoshis in range.')
    fields, raw = [], b''

    def add(name, value, description):
        nonlocal raw
        fields.append(dict(name=name, hex=value.hex(), start=len(raw), end=len(raw) + len(value), description=description))
        raw += value

    add('epoch', b'\x00', 'TapSighash epoch, currently zero.')
    add('hash_type', bytes([mode]), MODES[mode] + '; DEFAULT commits like ALL.')
    add('nVersion', tx.version, 'Transaction version, little-endian.')
    add('nLockTime', tx.locktime, 'Transaction absolute locktime, little-endian.')
    anyone = bool(mode & 128)
    if not anyone:
        components = [
            ('sha_prevouts', b''.join(bytes.fromhex(i.txid)[::-1] + i.txout_index.to_bytes(4, 'little') for i in tx.inputs), 'All input outpoints.'),
            ('sha_amounts', b''.join(a.to_bytes(8, 'little') for a in amounts), 'All previous input amounts.'),
            ('sha_scriptpubkeys', b''.join(encode_varint(len(s.to_bytes())) + s.to_bytes() for s in scripts), 'All previous locking scripts with CompactSize lengths.'),
            ('sha_sequences', b''.join(i.sequence for i in tx.inputs), 'All input sequences, including NONE and SINGLE.'),
        ]
        for name, value, description in components:
            add(name, hashlib.sha256(value).digest(), 'Single SHA256: ' + description)
            fields[-1]['source'] = value.hex()
    if mode & 3 not in (2, 3):
        outputs = b''.join(o.to_bytes() for o in tx.outputs)
        add('sha_outputs', hashlib.sha256(outputs).digest(), 'Single SHA256 of every serialized output.')
        fields[-1]['source'] = outputs.hex()
    add('spend_type', bytes([2 if script is not None else 0]), 'ext_flag × 2 + annex_present; this example has no annex.')
    if anyone:
        current = tx.inputs[index]
        add('outpoint', bytes.fromhex(current.txid)[::-1] + current.txout_index.to_bytes(4, 'little'), 'Only this input outpoint.')
        add('amount', amounts[index].to_bytes(8, 'little'), 'Only this previous amount.')
        lock = scripts[index].to_bytes()
        add('scriptPubKey', encode_varint(len(lock)) + lock, 'Only this previous lock, with its CompactSize length.')
        add('nSequence', current.sequence, 'Only this input sequence.')
    else:
        add('input_index', index.to_bytes(4, 'little'), 'Select this input inside the committed input list.')
    if mode & 3 == 3:
        value = tx.outputs[index].to_bytes()
        add('sha_single_output', hashlib.sha256(value).digest(), 'Single SHA256 of the output at this input’s index.')
        fields[-1]['source'] = value.hex()
    if script is not None:
        add('tapleaf_hash', tapleaf_tagged_hash(script), 'TapLeaf commits to leaf version c0 and this script.')
        add('key_version', b'\x00', 'Tapscript x-only public-key version.')
        add('codesep_pos', b'\xff' * 4, 'No OP_CODESEPARATOR was executed.')
    digest = tx.get_transaction_taproot_digest(index, scripts, amounts, ext_flag=int(script is not None), script=script, sighash=mode)
    assert tagged_hash(raw, 'TapSighash') == digest
    return dict(digest=digest.hex(), preimage=raw.hex(), fields=fields, tag='TapSighash')


def tree_metadata(count, path):
    internal, leaves, tree = taproot_template(count)
    address = internal.get_taproot_address(tree)
    root = get_tag_hashed_merkle_root(tree)
    names = ['multisig', 'recovery', 'hashlock']
    labels = ['2-of-3 co-signers', 'Recovery after 144 blocks', 'Secret + signature']
    rows = []
    for i, leaf in enumerate(leaves):
        control = ControlBlock(internal, tree, i, is_odd=address.is_odd()).to_hex()
        rows.append(dict(path=names[i], label=labels[i], script=leaf.to_hex(), leafHash=tapleaf_tagged_hash(leaf).hex(),
                         controlBlock=control, proof=[control[j:j + 64] for j in range(66, len(control), 64)],
                         witnessBytes=None))
    return dict(internalKey=internal.to_x_only_hex(), merkleRoot=root.hex(),
                tweak=f'{calculate_tweak(internal, tree):064x}', outputKey=address.to_script_pub_key().to_hex()[4:],
                address=address.to_string(), leafCount=count, path=path, leaves=rows,
                branchHash=tapbranch_tagged_hash(tapleaf_tagged_hash(leaves[1]), tapleaf_tagged_hash(leaves[2])).hex() if count == 3 else None)


def _integer(value, label, maximum, minimum=0):
    if isinstance(value, bool) or not re.fullmatch(r'[0-9]{1,16}', str(value)):
        raise ValueError(f'{label}: enter a whole decimal number.')
    number = int(value)
    if not minimum <= number <= maximum:
        raise ValueError(f'{label}: use a value from {minimum} to {maximum}.')
    return number


def _key(raw, label):
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9a-fA-F]{64}', raw.strip()):
        raise ValueError(f'{label}: enter a 32-byte learning private key in hexadecimal.')
    try:
        return PrivateKey.from_bytes(bytes.fromhex(raw.strip()))
    except Exception:
        raise ValueError(f'{label}: use a valid nonzero secp256k1 scalar.') from None


def trace_taproot_transaction(request):
    network = request.get('network')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose mainnet or testnet.')
    setup(network)
    draft = request['transaction']
    spend = draft['spendType']
    tree_example = spend == 'p2tr-script'
    inputs, outputs = draft.get('inputs'), draft.get('outputs')
    if not isinstance(inputs, list) or not isinstance(outputs, list) or not 1 <= len(inputs) <= 20 or not 1 <= len(outputs) <= 20:
        raise ValueError('Use between 1 and 20 inputs and outputs.')
    scripts, amounts, txins, txouts, metadata, snippets, seen = [], [], [], [], [], [], set()
    preamble = ('from bitcoinutils.setup import setup\nfrom bitcoinutils.keys import PrivateKey, PublicKey\n'
                'from bitcoinutils.script import Script\nfrom bitcoinutils.transactions import Transaction, TxInput, TxOutput, TxWitnessInput\n'
                'from bitcoinutils.utils import ControlBlock\n'
                'from bitcoin_education.taproot import taproot_template, taproot_address_to_script\n'
                f'setup({network!r})')
    maximum = 21_000_000 * 100_000_000
    for index, row in enumerate(inputs):
        label = f'Input {index + 1}'
        txid = str(row.get('txid', '')).strip().lower()
        if not re.fullmatch(r'[0-9a-f]{64}', txid) or txid == '0' * 64:
            raise ValueError(f'{label}: enter a nonzero, 64-character transaction ID.')
        vout = _integer(row.get('vout'), label + ' output index', 0xffffffff)
        if (txid, vout) in seen:
            raise ValueError('Each input must reference a distinct UTXO.')
        seen.add((txid, vout))
        amount = _integer(row.get('amount'), label + ' amount', maximum, 1)
        source = str(row.get('source', '')).strip()
        if row.get('sourceType') == 'address':
            try:
                lock = taproot_address_to_script(source)
            except Exception:
                raise ValueError(f'{label}: use a valid {network} P2TR Bech32m address.') from None
        elif row.get('sourceType') == 'script' and re.fullmatch(r'5120[0-9a-fA-F]{64}', source):
            lock = Script.from_raw(source.lower())
        else:
            raise ValueError(f'{label}: use a P2TR address or 5120 + 32-byte output key.')
        path = row.get('taprootPath', 'multisig') if tree_example else 'key'
        count = row.get('taprootLeaves', 2)
        if path not in ('key', 'multisig', 'recovery', 'hashlock') or (path == 'hashlock' and count != 3):
            raise ValueError(f'{label}: choose a path present in this tree.')
        meta = tree_metadata(count, path) if tree_example else None
        if not tree_example:
            internal_hex = str(row.get('internalKey', PUBLIC_KEYS[0])).strip().lower()
            try:
                if not re.fullmatch(r'[0-9a-f]{64}', internal_hex):
                    raise ValueError()
                internal_key = PublicKey('02' + internal_hex)
            except Exception:
                raise ValueError('Supply an on-curve, 32-byte x-only internal public key.') from None
            if internal_key.get_taproot_address().to_script_pub_key().to_hex() != lock.to_hex():
                raise ValueError('The internal key and empty-tree TapTweak do not match this previous output.')
        if tree_example and meta['outputKey'] != lock.to_hex()[4:]:
            raise ValueError(f'{label}: the chosen script tree does not match the previous Taproot lock. Use its displayed address.')
        sequence = _integer(row.get('sequence', '144' if path == 'recovery' else '4294967295'), label + ' sequence', 0xffffffff)
        scripts.append(lock); amounts.append(amount); metadata.append(meta)
        txins.append(TxInput(txid, vout, script_sig=Script([]), sequence=sequence.to_bytes(4, 'little')))
        snippets.append(f'previous_script_{index} = Script.from_raw({lock.to_hex()!r})\nprevious_amount_{index} = {amount}\n'
                        f'input_{index} = TxInput({txid!r}, {vout}, script_sig=Script([]), sequence=({sequence}).to_bytes(4, "little"))')
    for index, row in enumerate(outputs):
        try:
            lock = taproot_address_to_script(str(row.get('address', '')).strip())
        except Exception:
            raise ValueError(f'Output {index + 1}: use a valid {network} P2TR Bech32m address.') from None
        amount = _integer(row.get('amount'), f'Output {index + 1} amount', maximum)
        txouts.append(TxOutput(amount, lock))
        snippets.append(f'output_{index} = TxOutput({amount}, Script.from_raw({lock.to_hex()!r}))')
    total_in, total_out = sum(amounts), sum(o.amount for o in txouts)
    if max(total_in, total_out) > maximum or total_out > total_in:
        raise ValueError('Outputs must not exceed inputs, and totals must not exceed 21 million BTC.')
    tx = Transaction(txins, txouts, version=bytes.fromhex('02000000'), locktime=bytes(4), has_segwit=False)
    constructor = f'tx = Transaction([{", ".join(f"input_{i}" for i in range(len(inputs)))}], [{", ".join(f"output_{i}" for i in range(len(outputs)))}], version=bytes.fromhex("02000000"), locktime=bytes(4), has_segwit=False)'
    snippets.append(constructor)
    unsigned_hex, unsigned_txid = tx.serialize(), tx.get_txid()
    signing, sign_codes = None, []
    if request.get('signTransaction') is True:
        signing = dict(unsignedHex=unsigned_hex, unsignedTxid=unsigned_txid, unsignedBytes=tx.get_size(), inputs=[])
        tx.has_segwit = True
        for index, row in enumerate(inputs):
            meta = metadata[index]
            path = meta['path'] if meta else 'key'
            mode = mode_for(row, index, len(outputs))
            internal, leaves, tree = taproot_template(meta['leafCount']) if meta else (None, [], None)
            leaf_index = ['multisig', 'recovery', 'hashlock'].index(path) if path != 'key' else None
            leaf = leaves[leaf_index] if leaf_index is not None else None
            digest = trace_taproot_sighash(tx, index, scripts, amounts, mode, leaf)['digest']
            code = ('tx.has_segwit = True\n'
                    f'utxo_scripts = [{", ".join(f"previous_script_{i}" for i in range(len(inputs)))}]\n'
                    f'amounts = {amounts!r}\n')
            if meta:
                code += f'internal, leaves, tree = taproot_template({meta["leafCount"]})\n'
            if path == 'multisig':
                raw_keys = row.get('signerKeys', [])
                if not isinstance(raw_keys, list) or len(raw_keys) > 3 or any(not isinstance(k, str) for k in raw_keys):
                    raise ValueError('Supply exactly two distinct co-signer keys from scalars 2, 3 and 4.')
                keys = [_key(k, f'Input {index + 1} co-signer') for k in raw_keys if k.strip()]
                pubs = [k.get_public_key().to_x_only_hex() for k in keys]
                if len(pubs) != 2 or len(set(pubs)) != 2 or any(p not in PUBLIC_KEYS[1:4] for p in pubs):
                    raise ValueError('Supply exactly two distinct co-signer keys matching this 2-of-3 leaf.')
                signatures = {p: k.sign_taproot_input(tx, index, scripts, amounts, script_path=True, tapleaf_script=leaf, sighash=mode, tweak=False) for p, k in zip(pubs, keys)}
                witness = [signatures.get(p, '') for p in reversed(PUBLIC_KEYS[1:4])]
                code += f'leaf = leaves[0]\nsigner_keys = {[k.strip() for k in raw_keys if k.strip()]!r}\n'
                code += f'keys = [PrivateKey.from_bytes(bytes.fromhex(k)) for k in signer_keys]\nsignatures = {{k.get_public_key().to_x_only_hex(): k.sign_taproot_input(tx, {index}, utxo_scripts, amounts, script_path=True, tapleaf_script=leaf, sighash={mode}, tweak=False) for k in keys}}\n'
                code += f'witness = [signatures.get(p, "") for p in {list(reversed(PUBLIC_KEYS[1:4]))!r}]\n'
            else:
                key = _key(row.get('privateKey'), f'Input {index + 1}')
                pub = key.get_public_key()
                expected = internal.to_x_only_hex() if meta and path == 'key' else PUBLIC_KEYS[4 if path == 'recovery' else 5] if path != 'key' else None
                if expected is not None and pub.to_x_only_hex() != expected:
                    raise ValueError(f'Input {index + 1}: signing key does not match the selected path.')
                if not meta and pub.get_taproot_address().to_script_pub_key().to_hex() != scripts[index].to_hex():
                    raise ValueError(f'Input {index + 1}: key and no-tree TapTweak do not match the previous output.')
                signature = key.sign_taproot_input(tx, index, scripts, amounts, script_path=leaf is not None, tapleaf_script=leaf or Script([]), tapleaf_scripts=tree, sighash=mode, tweak=leaf is None)
                witness = [signature]
                code += f'key = PrivateKey.from_bytes(bytes.fromhex({row["privateKey"].strip()!r}))\n'
                code += f'leaf = leaves[{leaf_index}]\n' if leaf is not None else 'leaf = None\n'
                code += f'signature = key.sign_taproot_input(tx, {index}, utxo_scripts, amounts, script_path={leaf is not None!r}, tapleaf_script=leaf or Script([]), tapleaf_scripts={"tree" if meta else "None"}, sighash={mode}, tweak={leaf is None!r})\nwitness = [signature]\n'
                if path == 'hashlock':
                    secret = str(row.get('secret', '')).strip()
                    if not re.fullmatch(r'(?:[0-9a-fA-F]{2}){0,520}', secret):
                        raise ValueError('Supply a hex secret of at most 520 bytes.')
                    if hashlib.sha256(bytes.fromhex(secret)).digest() != hashlib.sha256(SECRET).digest():
                        raise ValueError('The secret does not match the hash committed to by this leaf.')
                    witness.append(secret.lower()); code += f'witness.append({secret.lower()!r})\n'
            if leaf is not None:
                address = internal.get_taproot_address(tree)
                control = ControlBlock(internal, tree, leaf_index, is_odd=address.is_odd()).to_hex()
                witness += [leaf.to_hex(), control]
                code += f'control = ControlBlock(internal, tree, {leaf_index}, is_odd=internal.get_taproot_address(tree).is_odd())\nwitness += [leaf.to_hex(), control.to_hex()]\n'
            tx.set_witness(index, TxWitnessInput(witness))
            code += f'tx.set_witness({index}, TxWitnessInput(witness))'
            sign_codes.append(code)
            sigs = [v for v in witness[:3 if path == 'multisig' else 1] if v]
            signing['inputs'].append(dict(digest=digest, signature=sigs[0], signatures=sigs,
                publicKey=scripts[index].to_hex()[4:] if path == 'key' else PUBLIC_KEYS[4 if path == 'recovery' else 5] if path != 'multisig' else PUBLIC_KEYS[1],
                scriptSig='', witness=witness, python=code, sighashType=mode, sighashName=MODES[mode],
                taprootPath=path, tapleafScript=leaf.to_hex() if leaf else None, controlBlock=witness[-1] if leaf else None))
        signing['txid'] = tx.get_txid()
    raw = bytes.fromhex(tx.serialize())
    fields, offset = [], 0

    def field(label, size, category, description, python=constructor):
        nonlocal offset
        fields.append(dict(id=f'tx-{len(fields)}', label=label, start=offset, end=offset + size,
                           category=category, description=description, python=python))
        offset += size

    field('Version', 4, 'header', 'Version 2 enables relative sequence locks.')
    if signing:
        field('SegWit marker', 1, 'witness', '00 marks extended serialization; excluded from TXID.')
        field('SegWit flag', 1, 'witness', '01 enables witness serialization; included in WTXID.')
    field('Input count', len(encode_varint(len(inputs))), 'count', 'Number of inputs, encoded as CompactSize.')
    for i, txin in enumerate(tx.inputs):
        prefix = f'Input {i + 1} · '
        field(prefix + 'previous TXID', 32, 'outpoint', 'Previous ID in internal byte order.', snippets[i])
        field(prefix + 'output index', 4, 'index', 'Previous output index, little-endian.', snippets[i])
        field(prefix + 'scriptSig length', 1, 'count', '00: a native Taproot input has no scriptSig.', snippets[i])
        field(prefix + 'empty scriptSig', 0, 'script', 'All authorization data belongs in witness.', snippets[i])
        sequence = int.from_bytes(txin.sequence, 'little')
        field(prefix + 'sequence', 4, 'sequence', f'{sequence} decimal, little-endian. Relative locks require version 2, a clear disable bit and sufficient UTXO age.', snippets[i])
    field('Output count', len(encode_varint(len(outputs))), 'count', 'Number of outputs, CompactSize.')
    for i, output in enumerate(tx.outputs):
        field(f'Output {i + 1} · amount', 8, 'amount', f'{output.amount:,} satoshis, little-endian.', snippets[len(inputs) + i])
        field(f'Output {i + 1} · script length', 1, 'count', '22 hex = 34 bytes of locking script.', snippets[len(inputs) + i])
        field(f'Output {i + 1} · locking script', 34, 'script', 'OP_1 (51) + push 32 bytes (20) + the tweaked x-only output key. Bech32m address characters are not serialized.', snippets[len(inputs) + i])
    if signing:
        for i, item in enumerate(signing['inputs']):
            witness, path = item['witness'], item['taprootPath']
            prefix = f'Input {i + 1} witness · '
            field(prefix + 'item count', 1, 'count', f'{len(witness)} witness items, CompactSize.', sign_codes[i])
            for j, value in enumerate(witness):
                size = len(bytes.fromhex(value))
                is_script = path != 'key' and j == len(witness) - 2
                is_control = path != 'key' and j == len(witness) - 1
                label = 'tapscript' if is_script else 'control block' if is_control else 'secret' if path == 'hashlock' and j == 1 else f'signature slot {j + 1}'
                field(prefix + label + ' length', len(encode_varint(size)), 'count', f'{size} bytes, CompactSize; this is not a Script push opcode.', sign_codes[i])
                if is_script or is_control or label == 'secret':
                    description = 'Only the chosen leaf script is revealed.' if is_script else 'Leaf version + output parity, internal key, and sibling hashes prove the script commitment.' if is_control else 'The preimage whose SHA256 must match the leaf hashlock.'
                    field(prefix + label, size, 'witness', description, sign_codes[i])
                elif size:
                    field(prefix + f'Schnorr signature {j + 1}', 64, 'signature', 'BIP340 signature: 32-byte r and 32-byte s. No DER encoding.', sign_codes[i])
                    if size == 65:
                        field(prefix + f'sighash type {j + 1}', 1, 'header', MODES[item['sighashType']] + '; explicit nonzero type.', sign_codes[i])
                else:
                    field(prefix + 'empty signature slot', 0, 'witness', 'An absent co-signer contributes zero to CHECKSIGADD. This is not a CHECKMULTISIG dummy.', sign_codes[i])
    field('Locktime', 4, 'header', 'Zero absolute locktime; recovery uses a relative sequence lock.')
    assert offset == len(raw), 'Taproot annotations must cover core serialization.'
    python = preamble + '\n\n' + '\n\n'.join(snippets + sign_codes) + '\nprint(tx.serialize())'
    for i, meta in enumerate(metadata):
        if meta is None:
            pub = PublicKey('02' + str(inputs[i].get('internalKey', PUBLIC_KEYS[0])).strip().lower())
            metadata[i] = dict(internalKey=pub.to_x_only_hex(), tweak=f'{calculate_tweak(pub, None):064x}', merkleRoot='', outputKey=scripts[i].to_hex()[4:], address=pub.get_taproot_address().to_string(), path='key', leafCount=0, leaves=[])
            continue
        mode = mode_for(inputs[i], i, len(outputs))
        sig_size = 64 if mode == 0 else 65
        # Serialized witness bytes only, including all CompactSize prefixes.
        meta['keyWitnessBytes'] = 1 + 1 + sig_size
        for leaf in meta['leaves']:
            sizes = [0, sig_size, sig_size] if leaf['path'] == 'multisig' else [sig_size, len(SECRET)] if leaf['path'] == 'hashlock' else [sig_size]
            sizes += [len(bytes.fromhex(leaf['script'])), len(bytes.fromhex(leaf['controlBlock']))]
            leaf['witnessBytes'] = 1 + sum(len(encode_varint(s)) + s for s in sizes)
    base = len(tx.to_bytes(False))
    return dict(network=network, compressed=True, publicKey='', address='', pythonPreamble=preamble,
        steps=[dict(id='transaction', hex=raw.hex(), byteLength=len(raw), fields=fields, python=constructor)],
        transaction=dict(spendType=spend, hasWitness=tx.has_segwit, txid=tx.get_txid(), wtxid=tx.get_wtxid(),
            baseSize=base, totalSize=tx.get_size(), weight=base * 3 + tx.get_size(), vsize=tx.get_vsize(),
            previousScripts=[s.to_hex() for s in scripts], previousAmounts=amounts, scriptCodes=[s.to_hex() for s in scripts],
            totalInput=total_in, totalOutput=total_out, fee=total_in - total_out, fields=fields, python=python,
            taproot=metadata, **({'signing': signing} if signing else {})))


def preview_taproot(request):
    trace = trace_taproot_transaction({**request, 'signTransaction': False})
    data = trace['transaction']
    tx = Transaction.from_raw(trace['steps'][0]['hex'])
    scripts = [Script.from_raw(s) for s in data['previousScripts']]
    previews = []
    for i, row in enumerate(request['transaction']['inputs']):
        meta = data['taproot'][i]
        leaf = None
        if meta and meta['path'] != 'key':
            leaf = Script.from_raw(next(l['script'] for l in meta['leaves'] if l['path'] == meta['path']))
        mode = mode_for(row, i, len(tx.outputs))
        exact = trace_taproot_sighash(tx, i, scripts, data['previousAmounts'], mode, leaf)
        anyone = bool(mode & 128)
        previews.append(dict(type=mode, name=MODES[mode], algorithm='BIP341', script=leaf.to_hex() if leaf else scripts[i].to_hex(),
            digest=exact['digest'], preimage=exact['preimage'], taproot=exact,
            inputScope=f'Only input {i + 1}' if anyone else f'All {len(tx.inputs)} input outpoints and locks',
            sequenceScope=f'Only input {i + 1}' if anyone else f'All {len(tx.inputs)} input sequences',
            outputScope='No outputs' if mode & 3 == 2 else f'Only output {i + 1}' if mode & 3 == 3 else f'All {len(tx.outputs)} outputs',
            amountScope=f'Only input {i + 1} amount' if anyone else f'All {len(tx.inputs)} previous input amounts'))
    return dict(network=request['network'], compressed=True, publicKey='', address='', steps=[], pythonPreamble='', sighash=dict(spendType=data['spendType'], inputs=previews))


def trace_taproot_input(tx, index, previous_scripts, amounts, age=144):
    """Verify key path or the three canonical example leaves; do not mutate tx."""
    stack, steps = [], []
    result = dict(script_type='p2tr', sighash=None, clean_stack=False)

    def record(phase, instruction, before=None, **extra):
        steps.append(dict(phase=phase, instruction=instruction, stack_before=before if before is not None else [v.hex() for v in stack], stack_after=[v.hex() for v in stack], error=None, **extra))

    def fail(code, message):
        if steps:
            steps[-1]['error'] = message
        return dict(result, success=False, error=dict(code=code, message=message), final_stack=[v.hex() for v in stack], steps=steps)

    if not isinstance(tx, Transaction) or type(index) is not int or not 0 <= index < len(tx.inputs):
        return fail('INVALID_INPUT', 'Choose an input inside a Transaction.')
    if len(previous_scripts) != len(tx.inputs) or len(amounts) != len(tx.inputs):
        return fail('MISSING_UTXO_METADATA', 'Taproot verification requires locks and amounts for every input.')
    if any(type(a) is not int or not 0 <= a <= 21_000_000 * 100_000_000 for a in amounts):
        return fail('INVALID_AMOUNT', 'Previous amounts must be integer satoshis in range.')
    lock = previous_scripts[index].to_hex()
    if not re.fullmatch(r'5120[0-9a-f]{64}', lock):
        return fail('UNSUPPORTED_SCRIPT', 'Use a native P2TR version-1 lock.')
    if tx.inputs[index].script_sig.to_hex():
        return fail('NONEMPTY_SCRIPTSIG', 'Taproot requires an empty scriptSig.')
    if not tx.has_segwit or len(tx.witnesses) != len(tx.inputs):
        return fail('INVALID_WITNESS', 'Supply exactly one witness slot per input.')
    items = tx.witnesses[index].stack
    if not items or any(not isinstance(v, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2})*', v) for v in items):
        return fail('INVALID_WITNESS', 'Supply witness items as hexadecimal bytes.')
    if len(items) > 1 and items[-1].startswith('50'):
        return fail('UNSUPPORTED_ANNEX', 'This lesson does not evaluate annexes.')

    def verify(signature, pubkey, leaf):
        if not signature:
            return False, None, None
        if len(signature) not in (64, 65) or (len(signature) == 65 and signature[-1] not in MODES.keys() - {0}):
            raise ValueError('A signature must be 64 bytes (DEFAULT), or 65 bytes with a valid nonzero type.')
        mode = signature[-1] if len(signature) == 65 else 0
        digest = trace_taproot_sighash(tx, index, previous_scripts, amounts, mode, leaf)['digest']
        result['sighash'] = MODES[mode]
        return schnorr_verify(bytes.fromhex(digest), pubkey, signature[:64]), digest, MODES[mode]

    try:
        if len(items) == 1:
            result['taproot_path'] = 'key'
            stack.append(bytes.fromhex(items[0])); record('witness', 'LOAD_SIGNATURE', before=[])
            valid, digest, _ = verify(stack.pop(), bytes.fromhex(lock[4:]), None)
            stack.append(b'\x01' if valid else b'')
            record('key path', 'VERIFY_SCHNORR', before=items, digest=digest, signature_valid=valid)
            if not valid:
                return fail('INVALID_SIGNATURE', 'The Schnorr signature does not verify against the output key.')
        else:
            raw, control = bytes.fromhex(items[-2]), bytes.fromhex(items[-1])
            if len(control) < 33 or len(control) > 33 + 32 * 128 or (len(control) - 33) % 32:
                return fail('INVALID_CONTROL_BLOCK', 'Control block length must be 33 + 32 × proof depth.')
            if control[0] & 0xfe != 0xc0:
                return fail('UNSUPPORTED_LEAF_VERSION', 'This lesson evaluates c0 Tapscript leaves only.')
            leaf = Script.from_raw(raw.hex())
            leaf_hash = tagged_hash(b'\xc0' + encode_varint(len(raw)) + raw, 'TapLeaf')
            root = leaf_hash
            for j in range(33, len(control), 32):
                root = tapbranch_tagged_hash(root, control[j:j + 32])
            internal = PublicKey('02' + control[1:33].hex())
            output, odd = tweak_taproot_pubkey(internal.key.to_string(), calculate_tweak(internal, root))
            result.update(tapleaf_hash=leaf_hash.hex(), merkle_root=root.hex(), control_block=control.hex(), witness_script=raw.hex())
            record('script commitment', 'CHECK_TAPROOT_PROOF')
            if output[:32].hex() != lock[4:] or bool(control[0] & 1) != odd:
                return fail('TAPROOT_COMMITMENT_MISMATCH', 'The script and control block do not reconstruct this output key and parity.')
            _, canonical, _ = taproot_template(3)
            index_leaf = next((i for i, s in enumerate(canonical) if s.to_bytes() == raw), None)
            if index_leaf is None:
                return fail('UNSUPPORTED_TAPSCRIPT', 'This evaluator supports the three canonical learning leaves.')
            path = ['multisig', 'recovery', 'hashlock'][index_leaf]
            result['taproot_path'] = path
            args = [bytes.fromhex(v) for v in items[:-2]]
            if any(len(v) > 520 for v in args):
                return fail('WITNESS_ITEM_TOO_LARGE', 'Initial stack items must be at most 520 bytes.')
            for arg in args:
                before = [v.hex() for v in stack]; stack.append(arg); record('witness', 'LOAD_ARGUMENT', before)
            if path == 'multisig':
                if len(stack) != 3:
                    return fail('INVALID_STACK', 'Provide three signature slots in reverse key order; unused slots are empty.')
                count = 0
                for j, pub in enumerate(PUBLIC_KEYS[1:4]):
                    before = [v.hex() for v in stack]
                    if j:
                        count = int.from_bytes(stack.pop(), 'little')
                    signature = stack.pop()
                    valid, digest, _ = verify(signature, bytes.fromhex(pub), leaf)
                    count += int(valid); stack.append(bytes([count]) if count else b'')
                    record('tapscript', 'OP_CHECKSIG' if j == 0 else 'OP_CHECKSIGADD', before, digest=digest, signature_valid=valid)
                    if signature and not valid:
                        return fail('INVALID_SIGNATURE', 'A nonempty Tapscript signature must verify (NULLFAIL).')
                before = [v.hex() for v in stack]; stack[:] = [b'\x01' if count == 2 else b'']; record('tapscript', 'OP_NUMEQUAL', before)
                if count != 2:
                    return fail('THRESHOLD_NOT_MET', 'Exactly two of the three signature slots must verify.')
            else:
                if len(stack) != (2 if path == 'hashlock' else 1):
                    return fail('INVALID_STACK', 'Provide the signature, and a secret for the hashlock leaf.')
                if path == 'recovery':
                    sequence = int.from_bytes(tx.inputs[index].sequence, 'little')
                    record('tapscript', 'OP_CHECKSEQUENCEVERIFY')
                    if int.from_bytes(tx.version, 'little', signed=True) < 2 or sequence & (1 << 31) or sequence & (1 << 22) or (sequence & 0xffff) < 144:
                        return fail('CSV_UNSATISFIED', 'Recovery needs version 2 and a block-based sequence of at least 144 with the disable bit clear.')
                    record('modeled UTXO age', 'CHECK_RELATIVE_AGE')
                    if type(age) is not int or age < (sequence & 0xffff):
                        return fail('NONFINAL_RELATIVE_LOCK', 'The modeled UTXO is younger than the sequence delay; it cannot be included yet.')
                    result['age'] = age
                if path == 'hashlock':
                    before = [v.hex() for v in stack]; secret = stack.pop(); stack.append(hashlib.sha256(secret).digest()); record('tapscript', 'OP_SHA256', before)
                    before = [v.hex() for v in stack]; actual = stack.pop(); record('tapscript', 'OP_EQUALVERIFY', before)
                    if actual != hashlib.sha256(SECRET).digest():
                        return fail('HASHLOCK_MISMATCH', 'The secret does not match the committed SHA256 hash.')
                before = [v.hex() for v in stack]
                signature = stack.pop()
                valid, digest, _ = verify(signature, bytes.fromhex(PUBLIC_KEYS[4 if path == 'recovery' else 5]), leaf)
                stack.append(b'\x01' if valid else b''); record('tapscript', 'OP_CHECKSIG', before, digest=digest, signature_valid=valid)
                if not valid:
                    return fail('INVALID_SIGNATURE', 'The selected leaf’s signature does not verify.')
    except (ValueError, TypeError, IndexError, AssertionError) as error:
        return fail('INVALID_TAPROOT_DATA', str(error) or 'Invalid Taproot data.')
    result['clean_stack'] = stack == [b'\x01']
    return dict(result, success=result['clean_stack'], error=None, final_stack=[v.hex() for v in stack], steps=steps)


def execution_taproot(request):
    options = request['execution']
    index = options['inputIndex']
    scripts = options.get('previousScripts', [options['previousScript']])
    amounts = options.get('amounts', [options['amount']])
    experiment = options.get('experiment', 'original')
    edits = {
        'original': '',
        'signature': 'items = tx.witnesses[index].stack\npos = next(i for i, v in enumerate(items[:-2] if len(items) > 1 else items) if len(v) in (128, 130))\nsig = items[pos]\nitems[pos] = ("00" if sig[:2] != "00" else "01") + sig[2:]',
        'output': 'tx.outputs[0].amount += 1',
        'amount': 'amounts[index] += 1',
        'other-amount': 'amounts[(index + 1) % len(amounts)] += 1',
        'control': 'items = tx.witnesses[index].stack\nif len(items) > 1:\n    c = items[-1]\n    items[-1] = c[:-2] + ("00" if c[-2:] != "00" else "01")',
        'leaf': 'items = tx.witnesses[index].stack\nif len(items) > 1:\n    items[-2] += "51"',
        'order': 'items = tx.witnesses[index].stack\nif len(items) == 5:\n    items[:3] = reversed(items[:3])',
        'missing': 'items = tx.witnesses[index].stack\nif len(items) == 5:\n    items[:3] = ["", "", items[2]]',
        'early': 'age = 143',
        'sequence': 'tx.inputs[index].sequence = (143).to_bytes(4, "little")',
        'secret': 'items = tx.witnesses[index].stack\nif len(items) == 4:\n    items[1] = "00"',
    }
    if experiment not in edits:
        raise ValueError('Choose an available Taproot experiment.')
    code = ('from bitcoinutils.transactions import Transaction\nfrom bitcoinutils.script import Script\n'
            'from bitcoin_education.taproot import trace_taproot_input\n'
            f'tx = Transaction.from_raw({options["hex"]!r})\nindex = {index!r}\n'
            f'previous_scripts = [Script.from_raw(s) for s in {scripts!r}]\namounts = {amounts!r}\nage = {options.get("age", 144)!r}\n'
            + edits[experiment] + '\nresult = trace_taproot_input(tx, index, previous_scripts, amounts, age)')
    namespace = {}; exec(code, namespace)
    result = namespace['result']; result['python'] = code
    return dict(network=request.get('network', 'mainnet'), compressed=True, publicKey='', address='', steps=[], pythonPreamble='', execution=result)
