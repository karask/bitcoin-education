// Educational message scheduling and policy modeling only; no Bitcoin cryptography.
export const NODES = [
  { id: 'A', name: 'Your node', x: 15, y: 50 },
  { id: 'B', name: 'Relay node', x: 39, y: 23 },
  { id: 'C', name: 'Selective node', x: 39, y: 77 },
  { id: 'D', name: 'Pool node', x: 66, y: 28 },
  { id: 'E', name: 'Farther peer', x: 85, y: 68 },
] as const;
export type NodeId = typeof NODES[number]['id'];
export const LINKS: [NodeId, NodeId][] = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['B', 'E'], ['D', 'E']];
export type NodeStatus = 'unseen' | 'requested' | 'checking' | 'accepted' | 'policy' | 'missing' | 'offline';
export interface SimulationOptions { feeRate: number; selectiveMinimum: number; missingAtC: boolean; offlineE: boolean }
export interface Entry { id: string; label: string; vsize: number; feeRate: number }
export interface Event { from: NodeId | 'wallet'; to: NodeId; kind: 'announce' | 'receive' | 'check' }
export interface Simulation {
  nodes: Record<NodeId, NodeStatus>;
  queue: Event[];
  logs: { event: Event; text: string; wave: number }[];
  wave: number;
  pools: Record<NodeId, Entry[]>;
  competitors: number;
}
export function initialSimulation(options: SimulationOptions): Simulation {
  const entry = (id: string, vsize: number, feeRate: number): Entry => ({ id, label: `Example ${id}`, vsize, feeRate });
  return {
    nodes: { A: 'unseen', B: 'unseen', C: 'unseen', D: 'unseen', E: options.offlineE ? 'offline' : 'unseen' },
    queue: [{ from: 'wallet', to: 'A', kind: 'receive' }], logs: [], wave: 0, competitors: 0,
    pools: { A: [entry('α', 180, 2)], B: [entry('α', 180, 2), entry('β', 320, 8)],
      C: options.selectiveMinimum <= 8 ? [entry('β', 320, 8)] : [], D: [entry('α', 180, 2), entry('γ', 240, 12)], E: [entry('δ', 400, 3)] },
  };
}
function advanceEvent(state: Simulation, options: SimulationOptions, wave: number): Simulation {
  if (!state.queue.length) return state;
  const [event, ...remaining] = state.queue;
  const next: Simulation = { ...state, nodes: { ...state.nodes }, queue: remaining, logs: [...state.logs] };
  const status = next.nodes[event.to];
  const label = `Node ${event.to}`;
  let text: string;
  if (status === 'offline') {
    text = `${label} is disconnected. No message is delivered over this illustrative link.`;
  } else if (event.kind === 'announce') {
    if (status !== 'unseen') {
      text = `${event.from} announces the ID to ${event.to}. ${label} already knows or is fetching it; no second download is scheduled in this model.`;
    } else {
      next.nodes[event.to] = 'requested';
      text = `${event.from} announces the transaction ID (inv). ${label} requests its bytes (getdata).`;
      next.queue.push({ ...event, kind: 'receive' });
    }
  } else if (event.kind === 'receive') {
    next.nodes[event.to] = 'checking';
    text = `${label} receives the transaction bytes${event.from === 'wallet' ? ' from your wallet' : ` from ${event.from} (tx)`}. Node-local checks come next.`;
    next.queue.push({ ...event, kind: 'check' });
  } else if (event.to === 'C' && options.missingAtC) {
    next.nodes.C = 'missing';
    text = 'Node C is missing a referenced output in this scenario. It cannot validate the spend yet, so it does not add it to its mempool or relay it. Missing-input recovery is outside this model.';
  } else if (event.to === 'C' && options.feeRate < options.selectiveMinimum) {
    next.nodes.C = 'policy';
    text = `Node C keeps this transaction out of its mempool: ${options.feeRate.toFixed(2)} sat/vB is below its illustrative ${options.selectiveMinimum} sat/vB minimum. Other nodes choose independently.`;
  } else {
    next.nodes[event.to] = 'accepted';
    text = `${label} adds the transaction to its own mempool and announces it to peers. Consensus and other policy checks are assumed to pass in this simulation.`;
    for (const [a, b] of LINKS) {
      const peer = a === event.to ? b : b === event.to ? a : null;
      if (peer && peer !== event.from) next.queue.push({ from: event.to, to: peer, kind: 'announce' });
    }
  }
  next.logs.push({ event, text, wave });
  return next;
}

// Process the messages that were already in flight together. Messages created by
// this wave wait for the next one, which keeps relay concurrent but still hop-by-hop.
export function advanceSimulation(state: Simulation, options: SimulationOptions): Simulation {
  if (!state.queue.length) return state;
  const pending = state.queue.length;
  const wave = (state.wave ?? 0) + 1;
  let next = state;
  for (let index = 0; index < pending; index += 1) next = advanceEvent(next, options, wave);
  return { ...next, wave };
}
export function addCompetition(state: Simulation, node: NodeId, minimum = 0): Simulation {
  if (state.nodes[node] === 'offline' || state.competitors >= 8) return state;
  const id = `extra-${state.competitors + 1}`;
  return { ...state, competitors: state.competitors + 1,
    pools: { ...state.pools, [node]: [...state.pools[node], { id, label: `New example ${state.competitors + 1}`, vsize: 280, feeRate: Math.max(15, minimum) }] } };
}
