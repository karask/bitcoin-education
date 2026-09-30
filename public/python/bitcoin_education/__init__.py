"""Project-local educational helpers built on the bitcoinutils core APIs."""

from bitcoin_education.block import (
    create_coinbase_transaction,
    get_block_subsidy,
    trace_merkle_root,
)
from bitcoin_education.p2sh import trace_p2sh_input
from bitcoin_education.p2pkh import trace_p2pkh_input
from bitcoin_education.p2wsh import trace_p2wsh_input
from bitcoin_education.nested import trace_nested_p2wpkh_input
from bitcoin_education.p2wpkh import trace_p2wpkh_input
from bitcoin_education.segwit_block import create_segwit_coinbase_transaction
from bitcoin_education.taproot import trace_taproot_input, trace_taproot_sighash
from bitcoin_education.sighash import trace_segwit_v0_sighash

__all__ = [
    "create_coinbase_transaction",
    "get_block_subsidy",
    "trace_merkle_root",
    "trace_p2sh_input",
    "trace_p2pkh_input",
    "trace_p2wpkh_input",
    "trace_p2wsh_input",
    "trace_nested_p2wpkh_input",
    "create_segwit_coinbase_transaction",
    "trace_segwit_v0_sighash",
    "trace_taproot_input",
    "trace_taproot_sighash",
]
