export type Network = 'mainnet' | 'testnet';
export type Theme = 'light' | 'dark';
export type CodeMode = 'pseudocode' | 'python';
export type TransactionPage = 'transaction' | 'signing' | 'execution' | 'propagation' | 'construction' | 'mining' | 'blocks';
export type LessonKind = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'nested' | 'p2tr' | 'compare' | TransactionPage;
export interface CandidateResult {
  height: number; budget: number; used: number; subsidy: number; fees: number; reward: number;
  entries: { id: string; label: string; fee: number; vsize: number; rate: number; txid: string; selected: boolean }[];
  selected: string[];
  coinbase: { txid: string; hex: string; scriptSig: string; payoutScript: string };
  merkle: { txids: string[]; levels: string[][]; levels_internal: string[][];
    pairs: { level: number; index: number; left: string; right: string; left_internal: string; right_internal: string; preimage: string; parent: string; parent_internal: string; duplicated: boolean }[];
    root: string; root_internal: string; mutated: boolean };
  python: string;
}

export interface MiningResult {
  target: string; bits: string; header: string; merkleRoot: string; python: string;
  attempts: { nonce: number; hash: string; success: boolean }[];
  nextNonce: number; found: boolean;
}

export interface TransactionDraft {
  inputs: { txid: string; vout: string; amount: string; source: string; sourceType: 'address' | 'script'; privateKey?: string; compressed?: boolean }[];
  outputs: { address: string; amount: string }[];
}
export interface TransactionResult {
  totalInput: number; totalOutput: number; fee: number;
  previousScripts: string[];
  fields: (ByteField & { category: string; python: string })[];
  python: string;
  signing?: {
    unsignedHex: string; unsignedTxid: string; txid: string; unsignedBytes: number;
    inputs: { digest: string; signature: string; publicKey: string; scriptSig: string; python: string }[];
  };
}

export interface LessonInput {
  execution?: { hex: string; previousScript: string; inputIndex: number; experiment: string };
  mining?: { startNonce: number; difficulty: 'easy' | 'harder'; count: number; merkleRoot: string };
  candidate?: { hex: string; fee: number; budget: number; height: number; include: boolean; network: Network };
  signTransaction?: boolean;
  transaction?: TransactionDraft;
  kind?: LessonKind;
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
  execution?: { success: boolean; final_stack: string[]; error: {code: string; message: string} | null; python: string; steps: {phase: string; instruction: string; stack_before: string[]; stack_after: string[]; error: string | null; digest?: string; signature_valid?: boolean}[] };
  mining?: MiningResult;
  candidate?: CandidateResult;
  transaction?: TransactionResult;
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
