import { useCallback, useEffect, useRef, useState } from 'react';
import type { LessonInput, LessonTrace, RuntimeStatus, WorkerReply } from './types';

export function usePython() {
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<RuntimeStatus>({ state: 'loading', message: 'Starting Python…', progress: 0 });
  const [trace, setTrace] = useState<LessonTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState(false);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const lastInput = useRef<LessonInput | null>(null);
  const statusRef = useRef<RuntimeStatus>(status);
  const activityStarted = useRef(0);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finishActivity = useCallback(() => {
    clearTimeout(activityTimer.current);
    const remaining = Math.max(0, 650 - (performance.now() - activityStarted.current));
    activityTimer.current = setTimeout(() => setActivity(false), remaining);
  }, []);

  useEffect(() => {
    const instance = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const response = event.data;
      if (response.type === 'status') {
        statusRef.current = response.status;
        setStatus(response.status);
        if (response.status.state === 'error') {
          setBusy(false);
          finishActivity();
        }
        if (response.status.state === 'ready' && lastInput.current) {
          instance.postMessage({ type: 'trace', id: requestId.current, input: lastInput.current });
        }
      } else if (response.id === requestId.current) {
        setBusy(false);
        finishActivity();
        if (response.type === 'result') { setTrace(response.trace); setError(null); }
        else { setTrace(null); setError(response.message); }
      }
    };
    instance.onerror = () => {
      setBusy(false);
      finishActivity();
      const errorStatus: RuntimeStatus = { state: 'error', message: 'The Python worker stopped. Restart it to reload the local runtime.', progress: 0 };
      statusRef.current = errorStatus;
      setStatus(errorStatus);
    };
    return () => { instance.terminate(); worker.current = null; clearTimeout(activityTimer.current); };
  }, [generation, finishActivity]);

  const calculate = useCallback((input: LessonInput) => {
    lastInput.current = input;
    requestId.current += 1;
    setTrace(null);
    setError(null);
    setBusy(true);
    clearTimeout(activityTimer.current);
    activityStarted.current = performance.now();
    setActivity(true);
    if (statusRef.current.state === 'ready') worker.current?.postMessage({ type: 'trace', id: requestId.current, input });
  }, []);

  const invalidate = useCallback(() => {
    requestId.current += 1;
    lastInput.current = null;
    setTrace(null);
    setError(null);
    setBusy(false);
    clearTimeout(activityTimer.current);
    setActivity(false);
  }, []);

  const retry = useCallback(() => {
    clearTimeout(activityTimer.current);
    setActivity(false);
    setTrace(null);
    setError(null);
    setStatus({ state: 'loading', message: 'Restarting Python…', progress: 0 });
    statusRef.current = { state: 'loading', message: 'Restarting Python…', progress: 0 };
    setGeneration((value) => value + 1);
  }, []);

  return { status, trace, error, busy, activity, previewingSighash: lastInput.current?.previewSighash === true, calculate, invalidate, retry };
}
