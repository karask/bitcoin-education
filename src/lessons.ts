export const EXAMPLE_PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

export const LESSON_STEPS = [
  {
    id: 'public-key', short: 'Public key', title: 'It starts with a public key.',
    eyebrow: 'THE STARTING POINT', operation: 'Serialize',
    description: 'A public key is a point on Bitcoin’s elliptic curve. First, we write that point as a sequence of bytes using the SEC format.',
    insight: 'The same point can be written in compressed or uncompressed form. Different bytes mean a different address—even though the underlying key is the same.',
    pseudo: 'public_key = serialize(key, format)', outputLabel: 'Serialized public key',
  },
  {
    id: 'sha256', short: 'SHA-256', title: 'Turn the key into a fingerprint.',
    eyebrow: 'THE FIRST HASH', operation: 'SHA-256',
    description: 'Pass every byte of the serialized public key through SHA-256. Any input length produces a 32-byte digest.',
    insight: 'Change the public key and the digest changes dramatically. Hashing is one-way: the digest cannot be decoded back into the original key.',
    pseudo: 'key_digest = SHA256(public_key)', outputLabel: 'SHA-256 digest',
  },
  {
    id: 'hash160', short: 'RIPEMD-160', title: 'A smaller fingerprint.',
    eyebrow: 'THE SECOND HASH', operation: 'RIPEMD-160',
    description: 'Hash the SHA-256 digest again, this time with RIPEMD-160. The result is the 20-byte public-key hash at the heart of this address.',
    insight: 'SHA-256 followed by RIPEMD-160 is commonly called HASH160. P2PKH means “pay to public key hash.”',
    pseudo: 'public_key_hash = RIPEMD160(key_digest)', outputLabel: 'Public-key hash · HASH160',
  },
  {
    id: 'version', short: 'Network', title: 'Give the hash a home.',
    eyebrow: 'THE NETWORK BYTE', operation: 'Prepend',
    description: 'Prepend a one-byte version to the public-key hash. It tells software which network and address type this payload belongs to.',
    insight: 'Mainnet P2PKH uses 0x00. Testnet P2PKH uses 0x6f. The network byte belongs to the address encoding; it does not change the public key.',
    pseudo: 'payload = network_version + public_key_hash', outputLabel: 'Versioned payload',
  },
  {
    id: 'checksum-hashes', short: 'Hash twice', title: 'Make a check for mistakes.',
    eyebrow: 'CHECKSUM PREPARATION', operation: 'SHA-256 × 2',
    description: 'Run SHA-256 twice over the entire versioned payload. Both the network byte and the public-key hash are covered.',
    insight: 'We hash raw bytes, not the text of their hexadecimal representation. A string such as “00” and the single byte 0x00 are different inputs.',
    pseudo: 'check_digest = SHA256(SHA256(payload))', outputLabel: 'Second SHA-256 digest',
  },
  {
    id: 'checksum', short: 'Checksum', title: 'Keep just four bytes.',
    eyebrow: 'ERROR DETECTION', operation: 'Take first 4',
    description: 'Take the first four bytes of the double-SHA-256 result. This compact checksum helps wallets detect an incorrectly typed address.',
    insight: 'A checksum detects mistakes; it is not a signature. It does not prove that someone owns a key or that an address has received bitcoin.',
    pseudo: 'checksum = first_4_bytes(check_digest)', outputLabel: 'Address checksum',
  },
  {
    id: 'payload', short: 'Assemble', title: 'All the pieces, together.',
    eyebrow: 'THE COMPLETE PAYLOAD', operation: 'Concatenate',
    description: 'Join the network version, public-key hash, and checksum. These 25 bytes contain everything needed to encode the address.',
    insight: 'The boundaries are exact: 1 byte for the version, 20 for the public-key hash, and 4 for the checksum. Explore each color to inspect its role.',
    pseudo: 'address_bytes = payload + checksum', outputLabel: 'Complete address payload',
  },
  {
    id: 'address', short: 'Base58Check', title: 'An address you can share.',
    eyebrow: 'THE FINAL ENCODING', operation: 'Base58Check',
    description: 'Encode the checked payload in Base58. The alphabet avoids look-alike characters such as 0, O, I, and l to make addresses easier to read and copy.',
    insight: 'Base58 is an encoding, not encryption. Its characters do not line up with individual input bytes, so the colored boundaries stay in the byte view below.',
    pseudo: 'address = Base58(address_bytes)', outputLabel: 'Your P2PKH address',
  },
] as const;
