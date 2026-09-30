"""Fair, signed input comparisons using the existing transaction lesson engine.

Outputs are identical P2WPKH scripts in every row. The internal common_outputs
switch only changes output decoding; input validation and signing are unchanged.
"""
from bitcoinutils.keys import PrivateKey, P2shAddress, P2wshAddress
from bitcoinutils.script import Script
from bitcoinutils.setup import setup
from bitcoinutils.transactions import Transaction
from bitcoin_education.taproot import tree_metadata, PUBLIC_KEYS

SINGLE = ('p2pkh', 'p2wpkh', 'nested', 'p2tr')
MULTISIG = ('p2sh', 'p2wsh', 'p2tr-script')
LABELS = {'p2pkh': 'Legacy P2PKH', 'p2wpkh': 'Native P2WPKH', 'nested': 'Nested SegWit',
          'p2tr': 'Taproot key path', 'p2sh': 'P2SH multisig', 'p2wsh': 'P2WSH multisig',
          'p2tr-script': 'Taproot script path'}
REVEALS = {
    'p2pkh': 'ECDSA signature and compressed public key, in scriptSig.',
    'p2wpkh': 'ECDSA signature and compressed public key, in witness.',
    'nested': 'The inner P2WPKH program in scriptSig; ECDSA signature and public key in witness.',
    'p2tr': 'One Schnorr signature. No internal key or script tree is revealed by this spend.',
    'p2sh': 'Two ECDSA signatures, an empty dummy and the full 2-of-3 script with all three public keys, in scriptSig.',
    'p2wsh': 'Two ECDSA signatures, an empty dummy and the full 2-of-3 script with all three public keys, in witness.',
    'p2tr-script': 'Two Schnorr signatures, one empty signature slot, the chosen 2-of-3 script and its control-block proof, in witness. The recovery script stays hidden.',
}


def canonical_ecdsa_signature(signature):
    """Re-encode core's r/s integers without unnecessary leading zero bytes.

    bitcoin-utils 0.8.7 pads a negated low-S integer to 32 bytes. If that
    integer is small, its extra zero prefix violates strict DER. Preserve the
    exact r and s values and sighash byte; no new signing or curve math occurs.
    """
    from ecdsa.util import sigencode_der
    from ecdsa import SECP256k1
    raw = bytes.fromhex(signature)
    r_length = raw[3]
    r = int.from_bytes(raw[4:4 + r_length], 'big')
    s_length = raw[5 + r_length]
    s = int.from_bytes(raw[6 + r_length:6 + r_length + s_length], 'big')
    assert len(raw) == 7 + r_length + s_length
    return (sigencode_der(r, s, SECP256k1.order) + raw[-1:]).hex()


def trace_transaction_comparison(request, trace_transaction):
    network = request.get('network', 'mainnet')
    if network not in ('mainnet', 'testnet'):
        raise ValueError('Choose mainnet or testnet.')
    options = request.get('transactionComparison', {})
    group = options.get('group', 'single')
    count = options.get('inputs', 1)
    outputs = options.get('outputs', 2)
    if group not in ('single', 'multisig'):
        raise ValueError('Choose single-key payments or 2-of-3 script spends.')
    if type(count) is not int or count not in (1, 2, 5):
        raise ValueError('Compare 1, 2 or 5 inputs.')
    if type(outputs) is not int or outputs not in (1, 2):
        raise ValueError('Compare 1 or 2 outputs.')
    setup(network)
    key = PrivateKey(secret_exponent=1)
    pub = key.get_public_key()
    participants = [PrivateKey(secret_exponent=n).get_public_key().to_hex() for n in (2, 3, 4)]
    multisig = Script(['OP_2', *participants, 'OP_3', 'OP_CHECKMULTISIG'])
    program = pub.get_segwit_address().to_script_pub_key()
    total = count * 100000
    recipient = PrivateKey(secret_exponent=7).get_public_key().get_segwit_address().to_string()
    change = PrivateKey(secret_exponent=8).get_public_key().get_segwit_address().to_string()
    common = [dict(address=recipient, amount=str(60000 if outputs == 2 else total - 1000))]
    if outputs == 2:
        common.append(dict(address=change, amount=str(total - 61000)))
    sources = {
        'p2pkh': pub.get_address().to_string(), 'p2wpkh': pub.get_segwit_address().to_string(),
        'nested': P2shAddress(script=program).to_string(), 'p2tr': pub.get_taproot_address().to_string(),
        'p2sh': P2shAddress(script=multisig).to_string(), 'p2wsh': P2wshAddress(script=multisig).to_string(),
        'p2tr-script': tree_metadata(2, 'multisig')['address'],
    }
    rows = []
    output_scripts = None
    for spend in SINGLE if group == 'single' else MULTISIG:
        inputs = []
        for i in range(count):
            row = dict(txid='0123456789abcdef' * 4, vout=str(i), amount='100000',
                       sourceType='address', source=sources[spend], compressed=True, privateKey=f'{1:064x}')
            if spend in ('p2sh', 'p2wsh'):
                row.update(signerKeys=[f'{n:064x}' for n in (2, 3)])
                row['witnessScript' if spend == 'p2wsh' else 'redeemScript'] = multisig.to_hex()
            elif spend == 'nested':
                row['redeemScript'] = program.to_hex()
            elif spend == 'p2tr':
                row['internalKey'] = PUBLIC_KEYS[0]
            elif spend == 'p2tr-script':
                row.update(taprootPath='multisig', taprootLeaves=2, signerKeys=[f'{2:064x}', f'{3:064x}', ''])
            inputs.append(row)
        trace = trace_transaction(dict(network=network, signTransaction=True,
            transaction=dict(spendType=spend, inputs=inputs, outputs=common)), common_outputs=True)
        data = trace['transaction']
        raw = bytes.fromhex(trace['steps'][0]['hex'])
        tx = Transaction.from_raw(raw.hex())
        scripts = [out.script_pubkey.to_hex() for out in tx.outputs]
        if output_scripts is None:
            output_scripts = scripts
        assert scripts == output_scripts, 'Every comparison row must use identical outputs.'
        signing = data['signing']
        sig_field = next(f for f in data['fields'] if 'signature' in f['label'].lower()
                         and f['end'] - f['start'] > 4)
        offset = sig_field['start'] + 4
        mutated = bytearray(raw)
        mutated[offset] ^= 1
        edited = Transaction.from_raw(mutated.hex())
        script_sig_bytes = sum(len(bytes.fromhex(item['scriptSig'])) for item in signing['inputs'])
        rows.append(dict(type=spend, label=LABELS[spend], reveals=REVEALS[spend],
            hasWitness=data['hasWitness'], baseSize=data['baseSize'], totalSize=data['totalSize'],
            weight=data['weight'], vsize=data['vsize'], scriptSigBytes=script_sig_bytes,
            witnessBytes=data['totalSize'] - data['baseSize'], txid=data['txid'], wtxid=data['wtxid'],
            unsignedTxid=signing['unsignedTxid'], hex=raw.hex(), python=data['python'],
            inputLock=data['previousScripts'][0], input=signing['inputs'][0],
            mutation=dict(field=sig_field['label'], byteOffset=offset, before=f'{raw[offset]:02x}',
                          after=f'{mutated[offset]:02x}', txid=edited.get_txid(), wtxid=edited.get_wtxid())))
    return dict(network=network, compressed=True, publicKey='', address='', steps=[], pythonPreamble='',
        transactionComparison=dict(group=group, inputs=count, outputs=outputs, totalInput=total,
            payment=int(common[0]['amount']), change=int(common[1]['amount']) if outputs == 2 else 0,
            referenceFee=1000, outputScripts=output_scripts, rows=rows))
