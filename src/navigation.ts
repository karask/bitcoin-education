import type { LessonKind } from './types';

export const TOPICS = [
  { id: 'addresses', title: 'Addresses', pages: ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'nested', 'p2tr', 'compare'] },
  { id: 'transactions', title: 'Transactions', pages: ['coins', 'transaction', 'signing', 'tx-compare'] },
  { id: 'scripts', title: 'Scripts & Timelocks', pages: ['execution'] },
  { id: 'network', title: 'Network & Blocks', pages: ['propagation', 'construction', 'mining', 'blocks'] },
] as const;
export type TopicId = typeof TOPICS[number]['id'];
export function topicFor(kind: LessonKind) {
  return TOPICS.find(topic => (topic.pages as readonly string[]).includes(kind));
}
