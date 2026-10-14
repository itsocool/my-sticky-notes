import { useEffect, useRef } from "react";
import { subscribe } from "./api";
export function useNativeEvent<T>(
  event: string,
  callback: (value: T) => void,
  onError: (error: unknown) => void,
) {
  const callbackRef = useRef(callback);
  const errorRef = useRef(onError);
  useEffect(() => {
    callbackRef.current = callback;
    errorRef.current = onError;
  });
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void subscribe<T>(event, (payload) => callbackRef.current(payload))
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => {
        if (!disposed) errorRef.current(error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [event]);
}
