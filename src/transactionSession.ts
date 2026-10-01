import type { FundingPlan, LessonTrace, Network, TransactionDraft, TransactionPage } from './types';

export type TransactionSource = 'example' | 'journey';
export interface TransactionSession {
  network: Network;
  draft: TransactionDraft;
  dirty: boolean;
  authored: boolean;
  selected: string;
  unsignedTrace: LessonTrace | null;
  signedTrace: LessonTrace | null;
  sighashPreview: LessonTrace['sighash'] | null;
  explorerIndex: number | null;
  funding: FundingPlan | null;
}
export function newSession(draft: TransactionDraft, network: Network = 'mainnet'): TransactionSession {
  return { draft, network, dirty: false, authored: false, selected: 'tx-0', unsignedTrace: null, signedTrace: null, sighashPreview: null, explorerIndex: null, funding: null };
}
export function editedSession(session: TransactionSession, draft: TransactionDraft, network = session.network): TransactionSession {
  return { ...session, draft, network, authored: true, dirty: true, unsignedTrace: null, signedTrace: null, sighashPreview: null, funding: null };
}
// User edits require an explicit build/sign. Only teaching examples are signed automatically.
export function preparationFor(session: TransactionSession, source: TransactionSource, page: TransactionPage): 'unsigned' | 'signed' | null {
  if (session.dirty) return null;
  if (page === 'signing' && session.signedTrace) return null;
  if (page === 'transaction' || page === 'signing') return !session.unsignedTrace ? 'unsigned' : null;
  return source === 'example' && !session.signedTrace ? 'signed' : null;
}
