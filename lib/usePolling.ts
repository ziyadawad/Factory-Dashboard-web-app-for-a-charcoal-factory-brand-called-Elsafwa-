"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import useSWR, { type Fetcher, type SWRConfiguration } from "swr";

// التاب ظاهر؟ (document.visibilityState) - is the tab visible?
function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== "hidden",
    () => true
  );
}

// طلب بيتكرر كل everyMs بس والتاب ظاهر والصفحة دي هي اللي على الشاشة (active). غير كده مفيش ولا طلب خالص.
// أول ما الصفحة ترجع تظهر: لو آخر رد أقدم من everyMs بيسأل حالا، وبعدين كل everyMs. الداتا القديمة بتفضل ظاهرة.
// Polls every everyMs only while the tab is visible AND this page is the one on screen (active); otherwise no request
// at all. When it becomes visible again: refetches at once if the last answer is older than everyMs, then every
// everyMs. The previous data stays on screen meanwhile.
export function usePolling<T>(
  key: string | null,
  fetcher: Fetcher<T, string>,
  everyMs: number,
  active: boolean,
  options: SWRConfiguration<T> = {}
) {
  const visible = usePageVisible();
  const on = active && visible;
  const onRef = useRef(on);
  onRef.current = on;
  const lastAt = useRef(0);

  const swr = useSWR<T>(key, fetcher, {
    dedupingInterval: 2000,
    errorRetryInterval: 15_000,
    ...options,
    refreshInterval: on ? everyMs : 0,
    refreshWhenHidden: false,
    // الفوكس مش بيعمل طلب (الظهور بيتعمل تحت) - focus never refetches (visibility is handled below)
    revalidateOnFocus: false,
    isPaused: () => !onRef.current,
    onSuccess: (data, k, config) => {
      lastAt.current = Date.now();
      options.onSuccess?.(data, k, config);
    },
  });

  const { mutate } = swr;
  useEffect(() => {
    if (on && key && Date.now() - lastAt.current >= everyMs) mutate();
  }, [on, key, everyMs, mutate]);

  return swr;
}
