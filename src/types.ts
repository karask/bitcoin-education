export type Network = 'mainnet' | 'testnet';
export type Theme = 'light' | 'dark';
export type CodeMode = 'pseudocode' | 'python';

export interface LessonInput {
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
}

export interface LessonTrace {
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
