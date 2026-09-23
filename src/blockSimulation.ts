import { LINKS, NODES } from './networkSimulation';
import type { NodeId } from './networkSimulation';

export type BlockNodeStatus = 'unseen' | 'announced' | 'reconstructing' | 'checking' | 'accepted';
export type BlockMessageKind = 'cmpctblock' | 'getblocktxn' | 'blocktxn' | 'validate';
export interface BlockMessage { from: NodeId; to: NodeId; kind: BlockMessageKind; receivedFrom?: NodeId }
export interface BlockSimulation {
  nodes: Record<NodeId, BlockNodeStatus>;
  queue: BlockMessage[];
  logs: { message: BlockMessage; text: string; wave: number }[];
  wave: number;
}

export function initialBlockSimulation(): BlockSimulation {
  return {
    nodes: { A: 'unseen', B: 'unseen', C: 'unseen', D: 'accepted', E: 'unseen' },
    queue: [
      { from: 'D', to: 'B', kind: 'cmpctblock' },
      { from: 'D', to: 'C', kind: 'cmpctblock' },
      { from: 'D', to: 'E', kind: 'cmpctblock' },
    ],
    logs: [], wave: 0,
  };
}

function relayFrom(node: NodeId, source: NodeId): BlockMessage[] {
  return LINKS.flatMap(([a, b]) => {
    const peer = a === node ? b : b === node ? a : null;
    return peer && peer !== source ? [{ from: node, to: peer, kind: 'cmpctblock' as const }] : [];
  });
}

function advanceMessage(state: BlockSimulation, message: BlockMessage, wave: number): BlockSimulation {
  const next = { ...state, nodes: { ...state.nodes }, queue: [...state.queue], logs: [...state.logs] };
  let text = '';
  if (message.kind === 'cmpctblock') {
    if (next.nodes[message.to] !== 'unseen') {
      text = `Node ${message.to} already has or is reconstructing this block; the duplicate compact announcement adds no download.`;
    } else if (message.to === 'C') {
      next.nodes.C = 'reconstructing';
      text = `Node ${message.from} sends cmpctblock to C. C cannot reconstruct every transaction from its mempool, so it requests the missing entries.`;
      next.queue.push({ from: 'C', to: message.from, kind: 'getblocktxn' });
    } else {
      next.nodes[message.to] = 'checking';
      text = `Node ${message.from} sends cmpctblock to ${message.to}. Its mempool supplies the referenced transactions; independent validation starts.`;
      next.queue.push({ from: message.to, to: message.to, kind: 'validate', receivedFrom: message.from });
    }
  } else if (message.kind === 'getblocktxn') {
    text = `Node ${message.from} sends getblocktxn to ${message.to} for the transactions it could not reconstruct.`;
    next.queue.push({ from: message.to, to: message.from, kind: 'blocktxn' });
  } else if (message.kind === 'blocktxn') {
    next.nodes[message.to] = 'checking';
    text = `Node ${message.from} replies with blocktxn. Node ${message.to} can now reconstruct the block and validate it.`;
    next.queue.push({ from: message.to, to: message.to, kind: 'validate', receivedFrom: message.from });
  } else {
    next.nodes[message.to] = 'accepted';
    text = `Node ${message.to} accepts the block, updates its chain and UTXO set, then relays a compact announcement to its other peers.`;
    next.queue.push(...relayFrom(message.to, message.receivedFrom ?? message.from));
  }
  next.logs.push({ message, text, wave });
  return next;
}

export function advanceBlockWave(state: BlockSimulation): BlockSimulation {
  if (!state.queue.length) return state;
  const pending = state.queue;
  const wave = state.wave + 1;
  let next: BlockSimulation = { ...state, queue: [] };
  for (const message of pending) next = advanceMessage(next, message, wave);
  return { ...next, wave };
}

export { LINKS, NODES };
