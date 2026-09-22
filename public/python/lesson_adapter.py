"""Educational traces composed exclusively from python-bitcoin-utils operations.

The snippets returned to the UI are the exact snippets executed here. The
adapter adds presentation metadata and bytes slicing/concatenation, not crypto.
"""
import json

from bitcoinutils.constants import NETWORK_P2PKH_PREFIXES
from bitcoinutils.keys import PublicKey, P2pkhAddress
from bitcoinutils.ripemd160 import ripemd160
from bitcoinutils.schnorr import hash_sha256
from bitcoinutils.setup import setup
from bitcoinutils.constants import NETWORK_P2SH_PREFIXES
from bitcoinutils.keys import P2shAddress
from bitcoinutils.script import Script
from bitcoinutils.keys import P2wpkhAddress, P2wshAddress, P2trAddress
from bitcoinutils.constants import NETWORK_SEGWIT_PREFIXES
from bitcoinutils.bech32 import CHARSET, Encoding, convertbits, bech32_create_checksum, bech32_encode
from bitcoinutils.utils import tagged_hash, tweak_taproot_pubkey


PROGRAM = [
    ('public-key', 'public_key = bytes.fromhex(\n    key.to_hex(compressed=compressed)\n)'),
    ('sha256', 'public_key_sha256 = hash_sha256(public_key)'),
    ('hash160', 'public_key_hash = ripemd160(public_key_sha256)'),
    ('version', 'version = NETWORK_P2PKH_PREFIXES[network]\nversioned_payload = version + public_key_hash'),
    ('checksum-hashes', 'checksum_sha256 = hash_sha256(versioned_payload)\nchecksum_sha256d = hash_sha256(checksum_sha256)'),
    ('checksum', 'checksum = checksum_sha256d[:4]'),
    ('payload', 'address_bytes = versioned_payload + checksum'),
    ('address', 'address = P2pkhAddress(\n    hash160=public_key_hash.hex()\n).to_string()'),
]


def field(id, label, start, end, description):
    return {'id': id, 'label': label, 'start': start, 'end': end, 'description': description}


def trace_p2pkh(request_json):
    request = json.loads(request_json)
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose Mainnet or Testnet.')
    compressed = request.get('compressed', True)
    if not isinstance(compressed, bool):
        raise ValueError('Choose a valid public-key representation.')
    raw_key = request.get('publicKey', '')
    if not isinstance(raw_key, str):
        raise ValueError('Enter a SEC public key in hexadecimal.')
    normalized = ''.join(raw_key.split()).lower()
    if normalized.startswith('0x'):
        normalized = normalized[2:]
    if len(normalized) not in (66, 130):
        raise ValueError('A SEC public key needs 66 hex characters (compressed) or 130 (uncompressed).')
    try:
        bytes.fromhex(normalized)
    except ValueError:
        raise ValueError('Use hexadecimal characters only: 0–9 and a–f.') from None
    try:
        key = PublicKey(hex_str=normalized)
    except Exception:
        raise ValueError('This is not a valid secp256k1 public key. Check its prefix and coordinates.') from None

    setup(network)
    namespace = {
        'key': key, 'network': network, 'compressed': compressed,
        'hash_sha256': hash_sha256, 'ripemd160': ripemd160,
        'NETWORK_P2PKH_PREFIXES': NETWORK_P2PKH_PREFIXES,
        'P2pkhAddress': P2pkhAddress,
    }
    for _, snippet in PROGRAM:
        exec(snippet, namespace)

    public_key = namespace['public_key']
    network_byte = namespace['version'].hex()
    key_fields = [
        field('prefix', 'SEC prefix', 0, 1, f"0x{public_key[0]:02x} identifies {'a compressed key and the parity of its y coordinate' if compressed else 'an uncompressed public key'}. This is a key prefix, not a network byte."),
        field('key', 'x coordinate', 1, 33, 'The 32-byte x coordinate of this point on the secp256k1 curve.'),
    ]
    if not compressed:
        key_fields.append(field('coordinate-y', 'y coordinate', 33, 65, 'The 32-byte y coordinate. Compressed keys omit this coordinate and record its parity in the prefix.'))
    version_field = field('version', 'Network version', 0, 1, f'0x{network_byte} identifies a P2PKH address on {network}. It is included when calculating the checksum.')
    hash_field = field('hash160', 'Public-key hash', 1, 21, 'The 20-byte RIPEMD-160(SHA-256(public key)) result. It commits to the chosen public-key representation.')
    checksum_field = field('checksum', 'Checksum', 21, 25, 'The first four bytes of SHA-256(SHA-256(version + public-key hash)). Used to detect typing errors, not to prove ownership.')
    layout = [version_field, hash_field, checksum_field]

    outputs = [
        ('public-key', public_key, key_fields),
        ('sha256', namespace['public_key_sha256'], [field('sha256', 'SHA-256 digest', 0, 32, 'A 32-byte digest of the entire serialized public key, including its SEC prefix.')]),
        ('hash160', namespace['public_key_hash'], [field('hash160', 'Public-key hash', 0, 20, 'RIPEMD-160 compresses the SHA-256 digest to 20 bytes. Together, the two hashes are called HASH160.')]),
        ('version', namespace['versioned_payload'], layout[:2]),
        ('checksum-hashes', namespace['checksum_sha256d'], [field('checksum', 'Checksum source', 0, 4, 'These first four bytes will become the address checksum.'), field('digest-rest', 'Remaining digest', 4, 32, 'The remaining 28 bytes of the second SHA-256 digest are not included in the address.')]),
        ('checksum', namespace['checksum'], [field('checksum', 'Checksum', 0, 4, 'Keep the first four bytes in their existing order. No byte reversal is needed.')]),
        ('payload', namespace['address_bytes'], layout),
        ('address', namespace['address_bytes'], layout),
    ]
    snippets = dict(PROGRAM)
    steps = []
    for id, value, fields in outputs:
        step = {'id': id, 'hex': value.hex(), 'byteLength': len(value), 'fields': fields, 'python': snippets[id]}
        if id == 'checksum-hashes':
            step['intermediate'] = {'label': 'First SHA-256 pass', 'hex': namespace['checksum_sha256'].hex()}
        if id == 'address':
            step['address'] = namespace['address']
        steps.append(step)

    preamble = (
        'from bitcoinutils.setup import setup\n'
        'from bitcoinutils.keys import PublicKey, P2pkhAddress\n'
        'from bitcoinutils.constants import NETWORK_P2PKH_PREFIXES\n'
        'from bitcoinutils.schnorr import hash_sha256\n'
        'from bitcoinutils.ripemd160 import ripemd160\n\n'
        f'network = {network!r}\ncompressed = {compressed!r}\n'
        f'key = PublicKey(hex_str={normalized!r})\nsetup(network)'
    )
    return json.dumps({
        'network': network, 'compressed': compressed,
        'publicKey': public_key.hex(), 'address': namespace['address'],
        'steps': steps, 'pythonPreamble': preamble,
    })


P2SH_PROGRAM = [
    ('redeem-script', "redeem_script = Script([\n    f'OP_{threshold}', *public_keys,\n    'OP_3', 'OP_CHECKMULTISIG'\n])\nscript_bytes = redeem_script.to_bytes()"),
    ('sha256', 'script_sha256 = hash_sha256(script_bytes)'),
    ('hash160', 'script_hash = ripemd160(script_sha256)'),
    ('version', 'version = NETWORK_P2SH_PREFIXES[network]\nversioned_payload = version + script_hash'),
    *PROGRAM[4:7],
    ('address', 'address = P2shAddress(\n    script=redeem_script\n).to_string()'),
]


def multisig_inputs(request):
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose Mainnet or Testnet.')
    threshold = request.get('threshold', 2)
    if type(threshold) is not int or threshold not in (1, 2, 3):
        raise ValueError('Require 1, 2, or 3 signatures.')
    raw_keys = request.get('publicKeys')
    if not isinstance(raw_keys, list) or len(raw_keys) != 3:
        raise ValueError('Provide three compressed public keys.')
    public_keys = []
    names = ['Alice', 'Bob', 'Carol']
    for name, raw in zip(names, raw_keys):
        if not isinstance(raw, str):
            raise ValueError(f'{name}: enter a compressed public key.')
        normalized = ''.join(raw.split()).lower().removeprefix('0x')
        try:
            if len(normalized) != 66 or normalized[:2] not in ('02', '03'):
                raise ValueError()
            bytes.fromhex(normalized)
            key = PublicKey(hex_str=normalized)
            if key.to_hex(compressed=True) != normalized:
                raise ValueError()
        except Exception:
            raise ValueError(f'{name}: use a valid 33-byte compressed secp256k1 public key.') from None
        public_keys.append(normalized)
    if len(set(public_keys)) != 3:
        raise ValueError('Use three distinct public keys so each participant represents a different key.')
    return network, threshold, public_keys


def trace_p2sh(request_json):
    network, threshold, public_keys = multisig_inputs(json.loads(request_json))
    setup(network)
    namespace = dict(threshold=threshold, public_keys=public_keys, network=network,
                     Script=Script, P2shAddress=P2shAddress, hash_sha256=hash_sha256,
                     ripemd160=ripemd160, NETWORK_P2SH_PREFIXES=NETWORK_P2SH_PREFIXES)
    for _, snippet in P2SH_PROGRAM:
        exec(snippet, namespace)
    script_fields = multisig_fields(threshold)
    layout = [
        field('version', 'Network version', 0, 1, f'0x{namespace["version"].hex()} identifies a P2SH address on {network}. Changing networks leaves the redeem script and its hash unchanged.'),
        field('hash160', 'Script hash', 1, 21, 'HASH160 of the entire serialized redeem script, including opcodes and push lengths.'),
        field('checksum', 'Checksum', 21, 25, 'The first four bytes of double-SHA-256 of the version and script hash.'),
    ]
    outputs = [
        (namespace['script_bytes'], script_fields),
        (namespace['script_sha256'], [field('sha256', 'SHA-256 digest', 0, 32, 'SHA-256 of all 105 bytes of the redeem script, not its hexadecimal text.')]),
        (namespace['script_hash'], [field('hash160', 'Script hash', 0, 20, 'RIPEMD-160 of the SHA-256 digest. This commits to the complete spending rule.')]),
        (namespace['versioned_payload'], layout[:2]),
        (namespace['checksum_sha256d'], [field('checksum', 'Checksum source', 0, 4, 'These first four bytes become the checksum.'), field('digest-rest', 'Remaining digest', 4, 32, 'These 28 bytes are not included in the address.')]),
        (namespace['checksum'], [field('checksum', 'Checksum', 0, 4, 'Keep the first four bytes in their original order.')]),
        (namespace['address_bytes'], layout),
        (namespace['address_bytes'], layout),
    ]
    steps = []
    for (id, snippet), (value, fields) in zip(P2SH_PROGRAM, outputs):
        steps.append(dict(id=id, python=snippet, hex=value.hex(), byteLength=len(value), fields=fields))
    steps[4]['intermediate'] = dict(label='First SHA-256 pass', hex=namespace['checksum_sha256'].hex())
    steps[7]['address'] = namespace['address']
    output_python = 'output_script = redeem_script.to_p2sh_script_pub_key()\noutput_bytes = output_script.to_bytes()'
    exec(output_python, namespace)
    output_bytes = namespace['output_bytes']
    output = dict(id='output-script', hex=output_bytes.hex(), byteLength=len(output_bytes), python=output_python, fields=[
        field('op-hash160', 'OP_HASH160', 0, 1, 'Hash the revealed redeem script using SHA-256 followed by RIPEMD-160.'),
        field('push-hash', 'Push script hash', 1, 2, '0x14 pushes the next 20 bytes onto the stack.'),
        field('hash160', 'Expected script hash', 2, 22, 'The same script hash encoded in the address. The sender locks funds to this value.'),
        field('op-equal', 'OP_EQUAL', 22, 23, 'Require the revealed script hash to match this commitment. P2SH validation also executes the revealed redeem script.'),
    ])
    preamble = (
        'from bitcoinutils.setup import setup\nfrom bitcoinutils.script import Script\n'
        'from bitcoinutils.keys import P2shAddress\n'
        'from bitcoinutils.constants import NETWORK_P2SH_PREFIXES\n'
        'from bitcoinutils.schnorr import hash_sha256\n'
        'from bitcoinutils.ripemd160 import ripemd160\n\n'
        f'network = {network!r}\nthreshold = {threshold}\npublic_keys = {public_keys!r}\nsetup(network)'
    )
    return json.dumps(dict(network=network, compressed=True, publicKey='', address=namespace['address'],
                           steps=steps, pythonPreamble=preamble, outputScript=output))


def multisig_fields(threshold):
    script_fields = [field('threshold', 'Required signatures', 0, 1,
                           f'OP_{threshold} puts the required signature count on the stack.')]
    for index, name in enumerate(['Alice', 'Bob', 'Carol']):
        offset = 1 + index * 34
        script_fields.extend([
            field(f'push-{index}', f'Push {name}’s key', offset, offset + 1,
                  '0x21 instructs Script to push the following 33 bytes. This length byte is part of the script and is hashed too.'),
            field(f'participant-{index}', f'{name}’s public key', offset + 1, offset + 34,
                  f'{name}’s compressed SEC public key. Its position matters: reordering keys changes the script hash.'),
        ])
    script_fields.extend([
        field('key-count', 'Total keys', 103, 104, 'OP_3 puts the total public-key count on the stack.'),
        field('checkmultisig', 'Check signatures', 104, 105, 'OP_CHECKMULTISIG checks the required signatures against these public keys when spending. Creating an address does not execute this script.'),
    ])
    return script_fields


MODERN_IMPORTS = '''from bitcoinutils.setup import setup
from bitcoinutils.keys import PublicKey, P2shAddress, P2wpkhAddress, P2wshAddress, P2trAddress
from bitcoinutils.script import Script
from bitcoinutils.constants import NETWORK_SEGWIT_PREFIXES, NETWORK_P2SH_PREFIXES
from bitcoinutils.schnorr import hash_sha256
from bitcoinutils.ripemd160 import ripemd160
from bitcoinutils.bech32 import convertbits, bech32_create_checksum, bech32_encode, Encoding
from bitcoinutils.utils import tagged_hash, tweak_taproot_pubkey
'''


def compressed_key(raw):
    if not isinstance(raw, str):
        raise ValueError('Enter a compressed SEC public key in hexadecimal.')
    normalized = ''.join(raw.split()).lower().removeprefix('0x')
    try:
        if len(normalized) != 66 or normalized[:2] not in ('02', '03'):
            raise ValueError()
        bytes.fromhex(normalized)
        key = PublicKey(hex_str=normalized)
        if key.to_hex() != normalized:
            raise ValueError()
    except Exception:
        raise ValueError('Use a valid 33-byte compressed secp256k1 public key (02 or 03 prefix).') from None
    return normalized


def byte_result(id, snippet, value, fields=None, label='Digest', description='Calculated by python-bitcoin-utils.'):
    return dict(id=id, python=snippet, hex=value.hex(), byteLength=len(value),
                fields=fields or [field('hash160', label, 0, len(value), description)])


def witness_fields(version, length):
    return [
        field('version', f'Witness version {version}', 0, 1,
              'OP_0 (0x00) encodes witness version 0.' if version == 0 else 'OP_1 (0x51) encodes witness version 1. The opcode byte is 0x51, while the address version value is 1.'),
        field('push-hash', 'Program length', 1, 2, f'0x{length:02x} pushes the following {length} program bytes. This length opcode is not encoded in the address.'),
        field('hash160', 'Witness program', 2, 2 + length,
              'The 32-byte tweaked output public key, in x-only form.' if version == 1 else f'The {length}-byte ' + ('public-key HASH160.' if length == 20 else 'SHA-256 hash of the witness script.')),
    ]


def p2sh_output_fields():
    return [field('op-hash160', 'OP_HASH160', 0, 1, 'Hash the redeem script revealed in scriptSig.'),
            field('push-hash', 'Push 20 bytes', 1, 2, '0x14 pushes the expected script hash.'),
            field('hash160', 'Redeem-script hash', 2, 22, 'HASH160 of the serialized redeem script, including its version and length opcodes.'),
            field('op-equal', 'OP_EQUAL', 22, 23, 'Require a matching script hash. Witness validation then checks the inner version-0 program.')]


def address_parts(address, version):
    separator = address.rfind('1')
    return [
        dict(label='Network', value=address[:separator], description='Human-readable network prefix: bc on mainnet, tb on testnet. Included in the checksum.'),
        dict(label='Separator', value='1', description='Separates the network prefix from the data. This character is not the witness version.'),
        dict(label='Version', value=address[separator + 1], description=f'Witness version {version}, represented as one five-bit value: q is 0; p is 1.'),
        dict(label='Program', value=address[separator + 2:-6], description='Witness-program bytes regrouped into five-bit values and mapped to the Bech32 alphabet. A 32-byte program needs four trailing zero padding bits.'),
        dict(label='Checksum', value=address[-6:], description='Six checksum characters cover the network prefix, version, and encoded program.'),
    ]


def trace_modern(request):
    kind = request['kind']
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose Mainnet or Testnet.')
    preamble = MODERN_IMPORTS + f'\nnetwork = {network!r}\nsetup(network)\n'
    if kind == 'p2wsh':
        _, threshold, keys = multisig_inputs(request)
        preamble += f'threshold = {threshold}\npublic_keys = {keys!r}\n'
    else:
        normalized = compressed_key(request.get('publicKey'))
        preamble += f'key = PublicKey(hex_str={normalized!r})\n'
    namespace = {}
    exec(preamble, namespace)
    steps = []

    def add(id, snippet, variable, fields=None, label='Digest', description='Calculated by python-bitcoin-utils.'):
        exec(snippet, namespace)
        result = byte_result(id, snippet, namespace[variable], fields, label, description)
        steps.append(result)
        return result

    if kind == 'p2wsh':
        add('witness-script', "witness_script = Script([\n    f'OP_{threshold}', *public_keys,\n    'OP_3', 'OP_CHECKMULTISIG'\n])\nscript_bytes = witness_script.to_bytes()", 'script_bytes', multisig_fields(threshold))
        add('sha256', 'program = hash_sha256(script_bytes)', 'program', label='Witness-script SHA-256', description='A single SHA-256 of the entire witness script. P2WSH does not apply RIPEMD-160.')
        object_snippet = 'address_obj = P2wshAddress(script=witness_script)'
        version = 0
    elif kind == 'p2tr':
        add('internal-key', 'internal_key = bytes.fromhex(key.to_x_only_hex())', 'internal_key', label='Internal x-only key', description='The 32-byte x coordinate selects the even-y point P. Opposite compressed prefixes with the same x coordinate produce the same Taproot internal key.')
        add('tag-hash', "tag_digest = hash_sha256(b'TapTweak')", 'tag_digest', label='Tag digest', description='SHA-256 of the UTF-8 tag TapTweak. Tagged hashing uses this digest twice to separate this hashing context from others.')
        add('tweak', "tweak = tagged_hash(internal_key, 'TapTweak')", 'tweak', label='TapTweak digest', description='SHA256(tag_digest || tag_digest || internal_key). This example has no script tree: no Merkle root bytes are appended, including no zero-filled root.')
        add('output-key', "tweaked_point, output_is_odd = tweak_taproot_pubkey(\n    key.to_bytes(), int.from_bytes(tweak, 'big')\n)\nprogram = tweaked_point[:32]", 'program', label='Tweaked output x-only key', description='The library computes Q = P + tG with P normalized to even y. The address carries x(Q), not the internal key and not a hash of Q.')
        object_snippet = 'address_obj = P2trAddress(\n    witness_program=program.hex(), is_odd=output_is_odd\n)'
        version = 1
    else:
        add('public-key', 'public_key = bytes.fromhex(key.to_hex(compressed=True))', 'public_key', [
            field('prefix', 'SEC prefix', 0, 1, '02 or 03 records y parity. This lesson uses compressed SEC serialization, as required by standard SegWit v0 relay policy.'),
            field('key', 'x coordinate', 1, 33, 'The public key’s 32-byte x coordinate.'),
        ])
        add('sha256', 'key_digest = hash_sha256(public_key)', 'key_digest', label='Public-key SHA-256', description='SHA-256 of all 33 compressed public-key bytes, including the SEC prefix.')
        add('hash160', 'program = ripemd160(key_digest)', 'program', label='Public-key HASH160', description='The 20-byte public-key hash becomes the version-0 witness program.')
        object_snippet = 'address_obj = P2wpkhAddress(witness_program=program.hex())'
        version = 0

    length = len(namespace['program'])
    output = add('output-script', object_snippet + '\noutput_script = address_obj.to_script_pub_key()\noutput_bytes = output_script.to_bytes()', 'output_bytes', witness_fields(version, length))
    if kind == 'nested':
        # These exact 22 bytes are the redeem script, not a Bech32 address string.
        steps[-1]['id'] = 'redeem-script'
        add('script-hash', 'redeem_script = output_script\nredeem_hash = ripemd160(hash_sha256(output_bytes))', 'redeem_hash', label='Redeem-script HASH160', description='HASH160 of all 22 bytes: OP_0, the 20-byte push opcode, and the public-key hash.')
        layout = [field('version', 'P2SH version', 0, 1, 'Mainnet uses 05; testnet uses c4.'), field('hash160', 'Redeem-script hash', 1, 21, 'The 20-byte commitment to the inner witness-program script.')]
        add('version', 'versioned_payload = NETWORK_P2SH_PREFIXES[network] + redeem_hash', 'versioned_payload', layout)
        add('checksum', 'checksum = hash_sha256(hash_sha256(versioned_payload))[:4]', 'checksum', label='Base58Check checksum', description='First four bytes of double-SHA-256 of the P2SH version and redeem-script hash.')
        final = add('address', 'address_bytes = versioned_payload + checksum\naddress_obj = P2shAddress(script=redeem_script)\naddress = address_obj.to_string()', 'address_bytes', layout + [field('checksum', 'Checksum', 21, 25, 'Four checksum bytes detect transcription errors.')])
        final.update(address=namespace['address'], encoding='Base58Check', encodedFrom='Encoded from these 25 bytes')
        snippet = 'output_script = address_obj.to_script_pub_key()\noutput_bytes = output_script.to_bytes()'
        exec(snippet, namespace)
        outer = byte_result('outer-script', snippet, namespace['output_bytes'], p2sh_output_fields())
        return dict(network=network, compressed=True, publicKey=normalized, address=namespace['address'], steps=steps,
                    pythonPreamble=preamble, outputScript=outer, relatedScripts=[dict(title='Redeem script · inner P2WPKH', result=output)])

    add('network', 'hrp = NETWORK_SEGWIT_PREFIXES[network]\nnetwork_bytes = hrp.encode("ascii")', 'network_bytes', label='Network prefix (ASCII)', description='bc means mainnet; tb means testnet. It is address metadata, not part of the witness program or scriptPubKey.')
    data_snippet = f'witness_version = {version}\ndata = [witness_version] + convertbits(program, 8, 5)'
    exec(data_snippet, namespace)
    steps.append(dict(id='groups', python=data_snippet, hex='', byteLength=0, fields=[], symbols=dict(
        values=namespace['data'], characters=''.join(CHARSET[v] for v in namespace['data']),
        description='One version value followed by the program regrouped into five-bit values (0–31). These are not bytes. ' + ('Four zero bits pad the final program group.' if length == 32 else 'The 160 program bits divide exactly into 32 groups.'))))
    checksum_snippet = f'encoding = Encoding.{"BECH32M" if version == 1 else "BECH32"}\nchecksum = bech32_create_checksum(hrp, data, encoding)'
    exec(checksum_snippet, namespace)
    steps.append(dict(id='checksum', python=checksum_snippet, hex='', byteLength=0, fields=[], symbols=dict(
        values=namespace['checksum'], characters=''.join(CHARSET[v] for v in namespace['checksum']),
        description='Six five-bit checksum symbols, totaling 30 bits. ' + ('Bech32m uses checksum constant 0x2bc830a3 for witness version 1.' if version else 'Bech32 uses checksum constant 1 for witness version 0.'))))
    final = add('address', 'encoded = bech32_encode(hrp, data, encoding)\naddress = address_obj.to_string()\nassert address == encoded', 'program', label='Witness program', description='Only these program bytes are regrouped for the data portion of the address. Version and network are encoded separately.')
    final.update(address=namespace['address'], encoding='Bech32m' if version else 'Bech32',
                 encodedFrom='Witness program encoded in this address', addressParts=address_parts(namespace['address'], version))
    return dict(network=network, compressed=True, publicKey='' if kind == 'p2wsh' else normalized,
                address=namespace['address'], steps=steps, pythonPreamble=preamble, outputScript=output)


def trace_comparison(request):
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose Mainnet or Testnet.')
    normalized = compressed_key(request.get('publicKey'))
    preamble = MODERN_IMPORTS + f'\nnetwork = {network!r}\nsetup(network)\nkey = PublicKey(hex_str={normalized!r})\n'
    preamble += "single_key_script = Script([key.to_hex(), 'OP_CHECKSIG'])\n"
    namespace = {}
    exec(preamble, namespace)
    recipes = [
        ('p2pkh', 'P2PKH', 'key.get_address()', 'Base58Check', 'HASH160(compressed public key)', 'Signature and public key in scriptSig.'),
        ('p2sh', 'P2SH', 'P2shAddress(script=single_key_script)', 'Base58Check', 'HASH160(single-key CHECKSIG script)', 'Signature and redeem script in scriptSig.'),
        ('p2wpkh', 'P2WPKH', 'key.get_segwit_address()', 'Bech32', 'HASH160(compressed public key)', 'Empty scriptSig; signature and public key in witness.'),
        ('p2wsh', 'P2WSH', 'P2wshAddress(script=single_key_script)', 'Bech32', 'SHA256(single-key CHECKSIG script)', 'Empty scriptSig; signature and witness script in witness.'),
        ('nested', 'P2SH-P2WPKH', 'P2shAddress(script=key.get_segwit_address().to_script_pub_key())', 'Base58Check', 'HASH160(P2WPKH redeem script)', 'Redeem script in scriptSig; signature and public key in witness.'),
        ('p2tr', 'P2TR', 'key.get_taproot_address()', 'Bech32m', 'Tweaked x-only output key (no script tree)', 'Key-path example: empty scriptSig and a Schnorr signature in witness.'),
    ]
    steps, rows = [], []
    for kind, label, expression, encoding, commitment, spending in recipes:
        snippet = f'address_obj = {expression}\naddress = address_obj.to_string()\noutput_script = address_obj.to_script_pub_key()\noutput_bytes = output_script.to_bytes()'
        exec(snippet, namespace)
        raw = namespace['output_bytes']
        if kind in ('p2wpkh', 'p2wsh', 'p2tr'):
            fields = witness_fields(1 if kind == 'p2tr' else 0, len(raw) - 2)
        elif kind in ('p2sh', 'nested'):
            fields = p2sh_output_fields()
            if kind == 'p2sh':
                fields[2]['description'] = 'HASH160 of the single-key CHECKSIG redeem script.'
                fields[3]['description'] = 'Require a matching redeem-script hash. P2SH validation then executes the revealed CHECKSIG script.'
        else:
            fields = [field('prefix', 'OP_DUP OP_HASH160', 0, 2, 'Duplicate the public key and hash the copy.'), field('push-hash', 'Push 20 bytes', 2, 3, 'Push the expected public-key hash.'), field('hash160', 'Public-key hash', 3, 23, 'HASH160 of the compressed public key.'), field('checkmultisig', 'OP_EQUALVERIFY OP_CHECKSIG', 23, 25, 'Require a matching hash, then verify the signature.')]
        step = byte_result(kind, snippet, raw, fields)
        step.update(address=namespace['address'], encoding=encoding, encodedFrom='Actual locking script · scriptPubKey (address checksum is not stored here)')
        steps.append(step)
        rows.append(dict(type=label, address=namespace['address'], encoding=encoding, commitment=commitment, spending=spending, script=raw.hex(), scriptBytes=len(raw)))
    return dict(network=network, compressed=True, publicKey=normalized, address=steps[-1]['address'],
                steps=steps, pythonPreamble=preamble, comparisons=rows)


def trace_transaction(request):
    """Library serialization with presentation-only offsets and strict form validation."""
    import re
    from bitcoinutils.utils import encode_varint

    network = request.get('network')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose mainnet or testnet.')
    setup(network)
    draft = request.get('transaction', {})
    inputs, outputs = draft.get('inputs', []), draft.get('outputs', [])
    if not isinstance(inputs, list) or not isinstance(outputs, list) or not (1 <= len(inputs) <= 20 and 1 <= len(outputs) <= 20):
        raise ValueError('Use between 1 and 20 inputs and outputs.')
    maximum = 21_000_000 * 100_000_000

    def integer(value, label, limit, minimum=0):
        if isinstance(value, bool) or not re.fullmatch(r'[0-9]+', str(value)) or len(str(value)) > 16:
            raise ValueError(f'{label}: enter a whole decimal number.')
        number = int(value)
        if not minimum <= number <= limit:
            raise ValueError(f'{label}: use a value from {minimum} to {limit}.')
        return number

    def address_script(address, label):
        try:
            script = P2pkhAddress(address=address).to_script_pub_key()
            if len(script.to_bytes()) != 25:
                raise ValueError('Invalid P2PKH length')
            return script
        except (ValueError, TypeError, IndexError):
            raise ValueError(f'{label}: enter a valid {network} P2PKH address with a correct checksum.') from None

    preamble = ('from bitcoinutils.setup import setup\nfrom bitcoinutils.keys import P2pkhAddress\n'
                'from bitcoinutils.script import Script\nfrom bitcoinutils.transactions import Transaction, TxInput, TxOutput\n'
                f'setup({network!r})')
    namespace = {}
    exec(preamble, namespace)
    snippets, previous_scripts, amounts, out_amounts = [], [], [], []
    seen = set()
    for i, row in enumerate(inputs):
        label = f'Input {i + 1}'
        txid = str(row.get('txid', '')).strip().lower()
        if not re.fullmatch(r'[0-9a-f]{64}', txid) or txid == '0' * 64:
            raise ValueError(f'{label}: enter a nonzero, 64-character transaction ID in display order.')
        vout = integer(row.get('vout'), f'{label} output index', 0xffffffff)
        if (txid, vout) in seen:
            raise ValueError('Each input must reference a distinct UTXO (transaction ID and output index).')
        seen.add((txid, vout))
        amount = integer(row.get('amount'), f'{label} amount', maximum, 1)
        source = str(row.get('source', '')).strip()
        if row.get('sourceType') == 'script':
            source = source.lower()
            if not re.fullmatch(r'76a914[0-9a-f]{40}88ac', source):
                raise ValueError(f'{label}: use a standard 25-byte P2PKH script: 76a914 + 20-byte hash + 88ac.')
            script = Script.from_raw(source)
            source_code = f'Script.from_raw({source!r})'
        elif row.get('sourceType') == 'address':
            script = address_script(source, label)
            source_code = f'P2pkhAddress(address={source!r}).to_script_pub_key()'
        else:
            raise ValueError(f'{label}: choose address or locking script.')
        previous_scripts.append(script.to_hex())
        amounts.append(amount)
        snippets.append(f'# UTXO metadata: previous amount and lock are not serialized in this input.\n'
                        f'previous_amount_{i} = {amount}\nprevious_script_{i} = {source_code}\n'
                        f'input_{i} = TxInput({txid!r}, {vout}, script_sig=Script([]), sequence=bytes.fromhex("ffffffff"))')
    for i, row in enumerate(outputs):
        address = str(row.get('address', '')).strip()
        address_script(address, f'Output {i + 1}')
        amount = integer(row.get('amount'), f'Output {i + 1} amount', maximum)
        out_amounts.append(amount)
        snippets.append(f'output_{i} = TxOutput({amount}, P2pkhAddress(address={address!r}).to_script_pub_key())')
    total_in, total_out = sum(amounts), sum(out_amounts)
    if total_in > maximum or total_out > maximum:
        raise ValueError('The total value cannot exceed 21 million BTC.')
    if total_out > total_in:
        raise ValueError('Outputs exceed inputs. Reduce an output or add another UTXO.')
    constructor = (f'tx = Transaction(inputs=[{", ".join(f"input_{i}" for i in range(len(inputs)))}], '
                   f'outputs=[{", ".join(f"output_{i}" for i in range(len(outputs)))}],\n'
                   '                 version=bytes.fromhex("02000000"), locktime=bytes.fromhex("00000000"), has_segwit=False)\n'
                   'raw_hex = tx.serialize()')
    snippets.append(constructor)
    for snippet in snippets:
        exec(snippet, namespace)
    signing = None
    signing_codes = []
    if request.get('signTransaction') is True:
        from bitcoinutils.keys import PrivateKey
        # Validate all keys and their SEC encoding against the supplied previous locks.
        # No custom cryptography: derivation, hashing, signing, scripts and IDs use the library.
        keys = []
        for i, row in enumerate(inputs):
            key_hex = str(row.get('privateKey', '')).strip().lower()
            if not re.fullmatch(r'[0-9a-f]{64}', key_hex):
                raise ValueError(f'Input {i + 1}: enter a 32-byte private key as 64 hexadecimal characters.')
            try:
                key = PrivateKey.from_bytes(bytes.fromhex(key_hex))
            except Exception:
                raise ValueError(f'Input {i + 1}: the private key must be a valid, nonzero secp256k1 scalar.') from None
            compressed = row.get('compressed', True)
            if not isinstance(compressed, bool):
                raise ValueError(f'Input {i + 1}: choose compressed or uncompressed public-key format.')
            expected_lock = key.get_public_key().get_address(compressed=compressed).to_script_pub_key().to_hex()
            if expected_lock != previous_scripts[i]:
                raise ValueError(f'Input {i + 1}: the private key and public-key format do not match the previous P2PKH lock.')
            keys.append((key_hex, compressed))
        signing = dict(unsignedHex=namespace['raw_hex'], unsignedBytes=len(bytes.fromhex(namespace['raw_hex'])),
                       unsignedTxid=namespace['tx'].get_txid(), inputs=[])
        signing_imports = 'from bitcoinutils.keys import PrivateKey\nfrom bitcoinutils.constants import SIGHASH_ALL'
        preamble += '\n' + signing_imports
        exec(signing_imports, namespace)
        for i, (key_hex, compressed) in enumerate(keys):
            code = (f'key_{i} = PrivateKey.from_bytes(bytes.fromhex({key_hex!r}))\n'
                    f'public_key_{i} = key_{i}.get_public_key().to_hex(compressed={compressed!r})\n'
                    f'assert key_{i}.get_public_key().get_address(compressed={compressed!r}).to_script_pub_key().to_hex() == previous_script_{i}.to_hex()\n'
                    f'digest_{i} = tx.get_transaction_digest({i}, previous_script_{i}, SIGHASH_ALL)\n'
                    f'signature_{i} = key_{i}.sign_input(tx, {i}, previous_script_{i}, SIGHASH_ALL)\n'
                    f'tx.inputs[{i}].script_sig = Script([signature_{i}, public_key_{i}])')
            exec(code, namespace)
            signing_codes.append(code)
            signing['inputs'].append(dict(digest=namespace[f'digest_{i}'].hex(), signature=namespace[f'signature_{i}'],
                                          publicKey=namespace[f'public_key_{i}'], scriptSig=namespace['tx'].inputs[i].script_sig.to_hex(), python=code))
        final_code = 'raw_hex = tx.serialize()\ntxid = tx.get_txid()'
        exec(final_code, namespace)
        snippets.extend(signing_codes + [final_code])
        signing['txid'] = namespace['txid']
    raw = bytes.fromhex(namespace['raw_hex'])
    fields, offset = [], 0

    def field(label, size, category, description, python):
        nonlocal offset
        fields.append(dict(id=f'tx-{len(fields)}', label=label, start=offset, end=offset + size,
                           category=category, description=description, python=python))
        offset += size

    field('Version', 4, 'header', 'Version 2, stored as a four-byte little-endian integer. This is a legacy serialization without witness.', constructor)
    field('Input count', len(encode_varint(len(inputs))), 'count', f'{len(inputs)} inputs, encoded as CompactSize. This is a count, not a byte length.', constructor)
    for i, row in enumerate(inputs):
        prefix, code = f'Input {i + 1} · ', snippets[i]
        field(prefix + 'previous TXID', 32, 'outpoint', 'The previous transaction ID in internal byte order: the reverse of the byte pairs entered in display order.', code)
        field(prefix + 'output index', 4, 'index', f'Output {int(row["vout"])} of that previous transaction, numbered from zero. Four bytes, little-endian.', code)
        if signing:
            signed_input = signing['inputs'][i]
            script_size = len(bytes.fromhex(signed_input['scriptSig']))
            sig_size = len(bytes.fromhex(signed_input['signature']))
            pub_size = len(bytes.fromhex(signed_input['publicKey']))
            sign_code = signing_codes[i]
            field(prefix + 'scriptSig length', len(encode_varint(script_size)), 'count', f'{script_size} bytes of unlocking script follow. This CompactSize prefix is outside the script.', sign_code)
            field(prefix + 'signature push', 1, 'count', f'Push the next {sig_size} bytes onto the stack: DER signature plus one sighash byte.', sign_code)
            field(prefix + 'DER signature', sig_size - 1, 'signature', 'ECDSA signature encoded as a DER sequence of the integers r and s. Its length may vary. The sighash byte is separate.', sign_code)
            field(prefix + 'sighash type', 1, 'header', '01 selects SIGHASH_ALL. It follows the DER signature and is not part of DER. The signing preimage includes this type as a four-byte little-endian integer.', sign_code)
            field(prefix + 'public-key push', 1, 'count', f'Push the next {pub_size} bytes: the SEC-encoded public key.', sign_code)
            field(prefix + 'public key', pub_size, 'script', 'The revealed public key. Its HASH160 must match the previous P2PKH locking script, and the signature must verify against it.', sign_code)
        else:
            field(prefix + 'scriptSig length', 1, 'count', '00 means zero script bytes follow. It is a length prefix, not an OP_0 inside scriptSig.', code)
            field(prefix + 'empty scriptSig', 0, 'script', 'No bytes yet. Signing a P2PKH input adds a signature and public key here. The previous locking script does not belong here.', code)
        field(prefix + 'sequence', 4, 'sequence', 'ffffffff is the final sequence value. With locktime zero, this example has no transaction locktime delay.', code)
    field('Output count', len(encode_varint(len(outputs))), 'count', f'{len(outputs)} outputs, encoded as CompactSize.', constructor)
    for i, amount in enumerate(out_amounts):
        code = snippets[len(inputs) + i]
        field(f'Output {i + 1} · amount', 8, 'amount', f'{amount:,} satoshis, encoded as an eight-byte little-endian integer. Addresses and BTC decimal strings are not serialized.', code)
        field(f'Output {i + 1} · script length', 1, 'count', '19 hexadecimal is 25 decimal: the length of the P2PKH locking script in bytes.', code)
        field(f'Output {i + 1} · locking script', 25, 'script', 'OP_DUP OP_HASH160 <20-byte public-key hash> OP_EQUALVERIFY OP_CHECKSIG. This is the new output’s spending condition.', code)
    field('Locktime', 4, 'header', 'Zero: no absolute locktime constraint. Four bytes, little-endian.', constructor)
    assert offset == len(raw), 'Transaction annotations must cover the library serialization exactly.'
    python = preamble + '\n\n' + '\n\n'.join(snippets) + '\nprint(raw_hex)'
    step = dict(id='transaction', hex=raw.hex(), byteLength=len(raw), fields=fields, python=constructor)
    return dict(network=network, compressed=True, publicKey='', address='', steps=[step], pythonPreamble=preamble,
                transaction=dict(totalInput=total_in, totalOutput=total_out, fee=total_in - total_out,
                                 previousScripts=previous_scripts, fields=fields, python=python, **({'signing': signing} if signing else {})))


def trace_mining(request):
    """Real library header hashing with an explicitly supplied, non-transaction root."""
    options = request.get('mining', {})
    start, count = options.get('startNonce', 0), options.get('count', 64)
    difficulty = options.get('difficulty', 'easy')
    if type(start) is not int or type(count) is not int or not 1 <= count <= 256 or not 0 <= start <= 0xffffffff or start + count > 0x100000000:
        raise ValueError('Choose a valid uint32 nonce range and 1–256 attempts.')
    if difficulty not in ('easy', 'harder'):
        raise ValueError('Choose an available demonstration target.')
    bits = 0x200fffff if difficulty == 'easy' else 0x1f7fffff
    code = ("from bitcoinutils.block import BlockHeader\n\n"
            "# Supplied fixture root: NOT computed from the learner's transaction.\n"
            "header = BlockHeader(version=2, previous_block_hash=bytes(32),\n"
            "                     merkle_root=bytes.fromhex('11' * 32),\n"
            f"                     timestamp=1700000000, target_bits={bits}, nonce={start})\n"
            "target = header.get_target_hex()\nattempts = []\n"
            f"for nonce in range({start}, {start + count}):\n"
            "    header.nonce = nonce\n    block_hash = header.get_block_hash()\n"
            "    success = int(block_hash, 16) <= int(target, 16)\n"
            "    attempts.append(dict(nonce=nonce, hash=block_hash, success=success))\n"
            "    if success:\n        break\n"
            "header_hex = header.serialize_header().hex()")
    namespace = {}
    exec(code, namespace)
    attempts = namespace['attempts']
    return dict(network='mainnet', compressed=True, publicKey='', address='', steps=[], pythonPreamble='',
                mining=dict(target=namespace['target'], bits=f'{bits:08x}', header=namespace['header_hex'],
                            python=code, attempts=attempts, nextNonce=attempts[-1]['nonce'] + 1, found=attempts[-1]['success']))


def trace_execution(request):
    options = request['execution']
    index = options['inputIndex']
    if type(index) is not int or index < 0:
        raise ValueError('Choose a valid input index.')
    experiment = options.get('experiment', 'original')
    edits = {
        'original': '',
        'key': "replacement = PrivateKey(secret_exponent=2).get_public_key().to_hex()\nif tx.inputs[index].script_sig.script[1] == replacement:\n    replacement = PrivateKey(secret_exponent=3).get_public_key().to_hex()\ntx.inputs[index].script_sig.script[1] = replacement",
        'signature': "signature = tx.inputs[index].script_sig.script[0]\ntx.inputs[index].script_sig.script[0] = signature[:-4] + ('00' if signature[-4:-2] != '00' else '01') + signature[-2:]",
        'output': 'tx.outputs[0].amount += 1',
    }
    if experiment not in edits:
        raise ValueError('Choose an available experiment.')
    code = ("from bitcoinutils.transactions import Transaction\nfrom bitcoinutils.script import Script\nfrom bitcoinutils.keys import PrivateKey\nfrom bitcoinutils.learning import trace_p2pkh_input\n\n"
            f"tx = Transaction.from_raw({options['hex']!r})\nindex = {index}\nprevious_script = Script.from_raw({options['previousScript']!r})\n"
            + edits[experiment] + "\nresult = trace_p2pkh_input(tx, index, previous_script)")
    namespace = {}
    exec(code, namespace)
    result = namespace['result']
    result['python'] = code
    return dict(network='mainnet', compressed=True, publicKey='', address='', steps=[], pythonPreamble='', execution=result)


def trace_lesson(request_json):
    request = json.loads(request_json)
    if request.get('kind') == 'execution':
        return json.dumps(trace_execution(request))
    kind = request.get('kind', 'p2pkh')
    if kind == 'mining':
        return json.dumps(trace_mining(request))
    if kind == 'transaction':
        return json.dumps(trace_transaction(request))
    if kind == 'p2pkh':
        return trace_p2pkh(request_json)
    if kind == 'p2sh':
        return trace_p2sh(request_json)
    if kind == 'compare':
        return json.dumps(trace_comparison(request))
    if kind not in ('p2wpkh', 'p2wsh', 'nested', 'p2tr'):
        raise ValueError('Choose an available address lesson.')
    return json.dumps(trace_modern(request))
