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
