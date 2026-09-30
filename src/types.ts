export type Network = 'mainnet' | 'testnet';
export type Theme = 'light' | 'dark';
export type CodeMode = 'pseudocode' | 'python';
export type TransactionPage = 'transaction' | 'signing' | 'execution' | 'propagation' | 'construction' | 'mining' | 'blocks';
export type LessonKind = 'home' | 'tx-compare' | 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'nested' | 'p2tr' | 'compare' | TransactionPage;
export type SpendType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'nested' | 'p2tr' | 'p2tr-script';
export type SighashType = 0 | 1 | 2 | 3 | 129 | 130 | 131;
export type TaprootPath = 'key' | 'multisig' | 'recovery' | 'hashlock';
export interface TaprootTree {
  internalKey: string; merkleRoot: string; tweak: string; outputKey: string; address: string;
  leafCount: number; path: TaprootPath; branchHash?: string | null; keyWitnessBytes?: number;
  leaves: { path: TaprootPath; label: string; script: string; leafHash: string; controlBlock: string; proof: string[]; witnessBytes: number }[];
}
export interface Bip143Trace {
  fields: { name: string; start: number; end: number; size: number; hex: string }[];
  hashPrevouts: string; hashSequence: string; hashOutputs: string;
  prevouts_data: string | null; sequence_data: string | null; outputs_data: string | null;
  single_output_out_of_range: boolean;
}
export interface SighashPreview {
  spendType: SpendType;
  inputs: { type: SighashType; name: string; digest: string; preimage: string | null; algorithm: 'Legacy' | 'BIP143' | 'BIP341'; amountScope: string; inputScope: string; sequenceScope: string; outputScope: string; script: string; bip143?: Bip143Trace; taproot?: { fields: { name: string; start: number; end: number; hex: string; source?: string; description: string }[]; preimage: string; tag: string }; python?: string }[];
}
export interface MerkleTrace {
  txids: string[]; levels: string[][]; levels_internal: string[][];
  pairs: { level: number; index: number; left: string; right: string; left_internal: string; right_internal: string; preimage: string; parent: string; parent_internal: string; duplicated: boolean }[];
  root: string; root_internal: string; mutated: boolean;
}
export interface WitnessCommitment {
  wtxids: string[]; witness_tree: MerkleTrace; witness_root: string; witness_root_internal: string;
  witness_reserved_value: string; commitment_preimage: string; commitment_hash: string;
  commitment_script: string; commitment_output_index: number;
}
export interface CandidateResult {
  height: number; budget: number; used: number; subsidy: number; fees: number; reward: number;
  entries: { id: string; label: string; fee: number; vsize: number; rate: number; txid: string; wtxid: string; hasWitness: boolean; selected: boolean }[];
  selected: string[];
  coinbase: { txid: string; hex: string; scriptSig: string; payoutScript: string };
  merkle: MerkleTrace;
  witnessCommitment: WitnessCommitment | null;
  python: string;
}

export interface MiningResult {
  target: string; bits: string; header: string; merkleRoot: string; python: string;
  attempts: { nonce: number; hash: string; success: boolean }[];
  nextNonce: number; found: boolean;
}

export interface TransactionDraft {
  spendType?: SpendType;
  inputs: { txid: string; vout: string; amount: string; source: string; sourceType: 'address' | 'script'; privateKey?: string; compressed?: boolean; sighashType?: SighashType; redeemScript?: string; witnessScript?: string; signerKeys?: string[]; taprootPath?: TaprootPath; taprootLeaves?: 2 | 3; internalKey?: string; secret?: string; sequence?: string }[];
  outputs: { address: string; amount: string }[];
}
export interface TransactionResult {
  spendType: SpendType; hasWitness: boolean; txid: string; wtxid: string;
  baseSize: number; totalSize: number; weight: number; vsize: number;
  previousAmounts: number[]; scriptCodes: string[];
  totalInput: number; totalOutput: number; fee: number;
  previousScripts: string[];
  fields: (ByteField & { category: string; python: string })[];
  python: string;
  taproot?: TaprootTree[];
  signing?: {
    unsignedHex: string; unsignedTxid: string; txid: string; unsignedBytes: number;
    inputs: { signatures?: string[]; publicKeys?: string[]; signerIndexes?: number[]; redeemScript?: string; witnessScript?: string; required?: number; digest: string; signature: string; publicKey: string; scriptSig: string; witness: string[]; python: string; sighashType: SighashType; sighashName: string; taprootPath?: TaprootPath; tapleafScript?: string; controlBlock?: string }[];
  };
}

export interface TransactionComparisonResult {
  group: 'single' | 'multisig'; inputs: number; outputs: number; totalInput: number;
  payment: number; change: number; referenceFee: number; outputScripts: string[];
  rows: { type: SpendType; label: string; reveals: string; hasWitness: boolean;
    baseSize: number; totalSize: number; weight: number; vsize: number;
    scriptSigBytes: number; witnessBytes: number; txid: string; wtxid: string;
    unsignedTxid: string; hex: string; python: string; inputLock: string;
    input: NonNullable<TransactionResult['signing']>['inputs'][number];
    mutation: { field: string; byteOffset: number; before: string; after: string; txid: string; wtxid: string };
  }[];
}

export interface LessonInput {
  transactionComparison?: { group: 'single' | 'multisig'; inputs: number; outputs: number };
  execution?: { hex: string; previousScript: string; inputIndex: number; experiment: string; spendType: SpendType; amount: number; previousScripts?: string[]; amounts?: number[]; age?: number };
  mining?: { startNonce: number; difficulty: 'easy' | 'harder'; count: number; merkleRoot: string };
  candidate?: { hex: string; fee: number; budget: number; height: number; include: boolean; network: Network };
  signTransaction?: boolean;
  transaction?: TransactionDraft;
  kind?: LessonKind;
  previewSighash?: boolean;
  publicKeys?: string[];
  threshold?: number;
  publicKey: string;
  compressed: boolean;
  network: Network;
}

export interface ByteField {
  id: string;
  label: string;
  start: number;
  end: number;
  description: string;
}

export interface StepResult {
  id: string;
  hex: string;
  byteLength: number;
  fields: ByteField[];
  python: string;
  intermediate?: { label: string; hex: string };
  address?: string;
  encoding?: string;
  encodedFrom?: string;
  symbols?: { values: number[]; characters: string; description: string };
  addressParts?: { label: string; value: string; description: string }[];
}

export interface LessonTrace {
  transactionComparison?: TransactionComparisonResult;
  execution?: { success: boolean; final_stack: string[]; error: {code: string; message: string} | null; python: string; sighash: string | null; redeem_script?: string; witness_script?: string; required?: number; public_keys?: string[]; checks?: { signature: number; publicKey: number; digest: string; sighash: string; valid: boolean }[]; amount?: number; witness_program?: string; script_code?: string; clean_stack?: boolean; steps: {phase: string; instruction: string; kind?: string; stack_before: string[]; stack_after: string[]; error: string | null; digest?: string; signature_valid?: boolean; checks?: { signature: number; publicKey: number; digest: string; sighash: string; valid: boolean }[]}[] };
  mining?: MiningResult;
  candidate?: CandidateResult;
  transaction?: TransactionResult;
  sighash?: SighashPreview;
  outputScript?: StepResult;
  relatedScripts?: { title: string; result: StepResult }[];
  comparisons?: { type: string; address: string; encoding: string; commitment: string; spending: string; script: string; scriptBytes: number }[];
  network: Network;
  compressed: boolean;
  publicKey: string;
  address: string;
  steps: StepResult[];
  pythonPreamble: string;
}

export type RuntimeStatus =
  | { state: 'loading'; message: string; progress: number }
  | { state: 'ready'; message: string; progress: 100 }
  | { state: 'error'; message: string; progress: number };

export type WorkerReply =
  | { type: 'status'; status: RuntimeStatus }
  | { type: 'result'; id: number; trace: LessonTrace }
  | { type: 'error'; id: number; message: string };
