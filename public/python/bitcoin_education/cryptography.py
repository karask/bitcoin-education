"""Inspectable secp256k1 key/ECDSA math using the pinned core libraries.

Public learning inputs only. The displayed nonce is deliberately exposed to
teach the equations; this is not a wallet or transaction-signing interface.
"""
import json


def trace_cryptography(request):
    options = request.get('cryptography', {})
    private_hex = options.get('privateHex', '00' * 31 + '07')
    # A message edited in the ECDSA page must not block the earlier key pages.
    signing = request.get('kind') == 'ecdsa'
    message = options.get('message', 'Bitcoin makes more sense one step at a time.') if signing else ''
    experiment = options.get('experiment', 'original') if signing else 'original'
    if not isinstance(private_hex, str) or len(private_hex) != 64 or any(c not in '0123456789abcdefABCDEF' for c in private_hex):
        raise ValueError('Use exactly 64 hexadecimal characters for a public learning private-key example.')
    from ecdsa import SECP256k1
    if not 1 <= int(private_hex, 16) < SECP256k1.order:
        raise ValueError('The private scalar must satisfy 1 ≤ d < n. Zero and n are excluded.')
    if not isinstance(message, str) or len(message.encode('utf-8')) > 512:
        raise ValueError('Use a learning message of at most 512 UTF-8 bytes.')
    if experiment not in ('original', 'message', 'key', 'signature'):
        raise ValueError('Choose an available verification experiment.')
    code = f'''from hashlib import sha256
from bitcoinutils.keys import PrivateKey
from ecdsa import SECP256k1, SigningKey, BadSignatureError
from ecdsa.ellipticcurve import INFINITY
from ecdsa.rfc6979 import generate_k
from ecdsa.util import sigencode_string, sigdecode_string, sigencode_der

# Public learning data: both d and k are deliberately displayed.
d = int({private_hex.lower()!r}, 16)
message = {message!r}
experiment = {experiment!r}
G, n = SECP256k1.generator, SECP256k1.order
p = SECP256k1.curve.p()

def coordinates(point):
    if point == INFINITY:
        return None
    return dict(x=f"{{point.x():064x}}", y=f"{{point.y():064x}}")

# Every operation here uses library curve points; no float approximations.
Q = d * G
accumulator = INFINITY
multiplication = []
for index, bit in enumerate(bin(d)[2:]):
    before = accumulator
    doubled = accumulator + accumulator
    accumulator = doubled + G if bit == '1' else doubled
    multiplication.append(dict(index=index, bit=bit, before=coordinates(before),
                               doubled=coordinates(doubled), result=coordinates(accumulator)))
assert accumulator == Q
key = PrivateKey(secret_exponent=d).get_public_key()
compressed = key.to_hex(compressed=True)
uncompressed = key.to_hex(compressed=False)

# Reconstruct y from x and the SEC parity prefix. secp256k1 has p % 4 == 3.
alpha = (Q.x() ** 3 + 7) % p
root = pow(alpha, (p + 1) // 4, p)
decoded_y = root if root % 2 == Q.y() % 2 else p - root
assert decoded_y == Q.y()

# The toy lesson supplies z directly; here z comes from SHA-256(message).
# Bitcoin transaction sighashes are introduced in the separate Signing lesson.
digest = sha256(message.encode('utf-8')).digest()
z = int.from_bytes(digest, 'big')
sk = SigningKey.from_secret_exponent(d, curve=SECP256k1, hashfunc=sha256)
signature = sk.sign_digest_deterministic(digest, hashfunc=sha256, sigencode=sigencode_string)
r, s = sigdecode_string(signature, n)
k = generate_k(n, d, sha256, digest)
R = k * G
assert r == R.x() % n
assert s == (pow(k, -1, n) * (z + r * d)) % n

verification_digest = sha256((message + '!').encode('utf-8')).digest() if experiment == 'message' else digest
verification_d = d % (n - 1) + 1 if experiment == 'key' else d
verification_key = SigningKey.from_secret_exponent(verification_d, curve=SECP256k1).verifying_key
verification_r = r % (n - 1) + 1 if experiment == 'signature' else r
verification_signature = sigencode_string(verification_r, s, n)
w = pow(s, -1, n)
u1 = (int.from_bytes(verification_digest, 'big') * w) % n
u2 = (verification_r * w) % n
V = u1 * G + u2 * verification_key.pubkey.point
try:
    verified = verification_key.verify_digest(verification_signature, verification_digest, sigdecode=sigdecode_string)
except BadSignatureError:
    verified = False
assert verified == (V != INFINITY and V.x() % n == verification_r)

result = dict(d=str(d), privateHex=f"{{d:064x}}", p=f"{{p:064x}}", n=f"{{n:064x}}",
              G=coordinates(G), Q=coordinates(Q), compressed=compressed, uncompressed=uncompressed,
              multiplication=multiplication, recoveredY=f"{{decoded_y:064x}}", alpha=f"{{alpha:064x}}",
              message=message, digest=digest.hex(), z=str(z), k=f"{{k:064x}}", R=coordinates(R),
              r=f"{{r:064x}}", s=f"{{s:064x}}", lowS=f"{{min(s, n-s):064x}}",
              der=sigencode_der(r, min(s, n-s), n).hex(),
              verification=dict(experiment=experiment, digest=verification_digest.hex(),
                                Q=coordinates(verification_key.pubkey.point), r=f"{{verification_r:064x}}",
                                w=f"{{w:064x}}", u1=f"{{u1:064x}}", u2=f"{{u2:064x}}", V=coordinates(V), valid=verified))
print(json.dumps(result))
'''
    if request.get('kind') != 'ecdsa':
        # Earlier lessons replay key construction without introducing signing
        # vocabulary, nonces, or signature equations ahead of the ECDSA lesson.
        code = code.split('# The toy lesson supplies z directly;', 1)[0]
        code = code.replace('from ecdsa import SECP256k1, SigningKey, BadSignatureError', 'from ecdsa import SECP256k1')
        code = code.replace('from ecdsa.rfc6979 import generate_k\n', '')
        code = code.replace('from ecdsa.util import sigencode_string, sigdecode_string, sigencode_der\n', '')
        code = code.replace('# Public learning data: both d and k are deliberately displayed.', '# Public learning data: d is deliberately displayed.')
        code = code.replace(f'message = {message!r}\n', '').replace(f'experiment = {experiment!r}\n', '')
        code += '''result = dict(d=str(d), privateHex=f"{d:064x}", p=f"{p:064x}", n=f"{n:064x}",
              G=coordinates(G), Q=coordinates(Q), compressed=compressed, uncompressed=uncompressed,
              multiplication=multiplication, recoveredY=f"{decoded_y:064x}", alpha=f"{alpha:064x}")
print(json.dumps(result))
'''
    if request.get('kind') == 'private-keys':
        code = f'''from ecdsa import SECP256k1

# A private key is an element of the finite set {{1, ..., n-1}}.
d = int({private_hex.lower()!r}, 16)
n = SECP256k1.order
assert 1 <= d < n
private_bytes = d.to_bytes(32, 'big')
result = dict(d=str(d), privateHex=private_bytes.hex(),
              n=f"{{n:064x}}", p=f"{{SECP256k1.curve.p():064x}}")
print(json.dumps(result))
'''
    namespace = {'json': json}
    # Keep the replayable code standalone while capturing its result here.
    code = 'import json\n' + code
    exec(code.rsplit('\nprint(json.dumps(result))', 1)[0], namespace)
    result = namespace['result']
    result['python'] = code
    return dict(network=request.get('network', 'mainnet'), compressed=True,
                publicKey=result.get('compressed', ''), address='', steps=[], pythonPreamble='', cryptography=result)
