import type { LessonInput, WorkerReply } from './types';

interface Pyodide {
  runPython: (code: string) => unknown;
  unpackArchive: (data: ArrayBuffer, format: string, options: { extractDir: string }) => void;
  FS: { mkdirTree: (path: string) => void; writeFile: (path: string, content: string) => void };
  pyimport: (name: string) => { trace_lesson: (input: string) => string };
}

interface Manifest {
  pyodideVersion: string;
  wheels: { package: string; path: string; sha256: string }[];
}

const reply = (message: WorkerReply) => postMessage(message);
const status = (message: string, progress: number) => reply({ type: 'status', status: { state: 'loading', message, progress } });

async function checkedFetch(path: string) {
  const result = await fetch(path);
  if (!result.ok) throw new Error(`Could not load ${path} (${result.status}).`);
  return result;
}

async function initialize() {
  status('Starting your local Python runtime…', 8);
  const appBase = new URL(import.meta.env.BASE_URL, self.location.origin);
  const runtimeBase = new URL('runtime/', appBase).href;
  const manifestResponse = await checkedFetch(`${runtimeBase}manifest.json`);
  if (!manifestResponse.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The local Python runtime files are missing. Run npm run setup:runtime once, then restart Python.');
  }
  const manifest = await manifestResponse.json() as Manifest;
  const runtimeUrl = `${runtimeBase}pyodide.mjs`;
  const { loadPyodide } = await import(/* @vite-ignore */ runtimeUrl);
  const py: Pyodide = await loadPyodide({ indexURL: runtimeBase, fullStdLib: false });
  status('Loading the Bitcoin library…', 42);
  const sitePackages = py.runPython("import sysconfig; sysconfig.get_paths()['purelib']") as string;
  for (let i = 0; i < manifest.wheels.length; i++) {
    const wheel = manifest.wheels[i];
    const bytes = await (await checkedFetch(`${runtimeBase}${wheel.path}`)).arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== wheel.sha256) throw new Error(`The local ${wheel.package} package failed its integrity check. Run npm run setup:runtime again.`);
    py.unpackArchive(bytes, 'zip', { extractDir: sitePackages });
    status(`Preparing ${wheel.package}…`, 46 + Math.round(((i + 1) / manifest.wheels.length) * 40));
  }
  py.FS.mkdirTree('/app');
  py.FS.writeFile('/app/lesson_adapter.py', await (await checkedFetch(new URL('python/lesson_adapter.py', appBase).href)).text());
  py.runPython("import sys; sys.path.insert(0, '/app')");
  const adapter = py.pyimport('lesson_adapter');
  reply({ type: 'status', status: { state: 'ready', message: 'Python is running in your browser', progress: 100 } });
  return adapter;
}

// Serialize every operation: bitcoinutils.setup holds process-global network state.
const ready = initialize().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  reply({ type: 'status', status: { state: 'error', message, progress: 0 } });
  return null;
});
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ type: 'trace'; id: number; input: LessonInput }>) => {
  const request = event.data;
  if (request.type !== 'trace') return;
  queue = queue.then(async () => {
    const adapter = await ready;
    if (!adapter) return;
    try {
      const trace = JSON.parse(adapter.trace_lesson(JSON.stringify(request.input)));
      reply({ type: 'result', id: request.id, trace });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = raw.match(/ValueError: ([^\n]+)/)?.[1] ?? 'The library could not process this public key. Check the input and try again.';
      reply({ type: 'error', id: request.id, message });
    }
  });
};
