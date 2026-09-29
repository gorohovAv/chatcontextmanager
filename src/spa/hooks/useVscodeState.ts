import { useState, useEffect, useCallback } from 'react';
import { onMessage, sendMessage, getState, setState } from '../services/vscodeBridge';

export function useVscodeState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const saved = getState<Record<string, any>>();
    if (saved && key in saved) return saved[key];
    return initialValue;
  });

  const updateValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === 'function' ? (newValue as (p: T) => T)(prev) : newValue;
      const saved = getState<Record<string, any>>() || {};
      setState({ ...saved, [key]: resolved });
      return resolved;
    });
  }, [key]);

  return [value, updateValue] as const;
}

export function useVscodeMessage(handler: (msg: any) => void, deps: any[] = []) {
  useEffect(() => {
    const unsub = onMessage(handler);
    return unsub;
  }, deps);
}