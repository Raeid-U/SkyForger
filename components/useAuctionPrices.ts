import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auctionResponseSchema, type AuctionResponse } from "../lib/auctions";

export function useAuctionPrices() {
  const [response, setResponse] = useState<AuctionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const blockedUntil = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (request.current || Date.now() < blockedUntil.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 190000);
    try {
      const result = await fetch("/api/auctions", {
        signal: controller.signal,
      });
      const retry = result.headers.get("Retry-After");
      const seconds = retry === null ? NaN : Number(retry);
      const retryTime =
        retry === null
          ? 0
          : Number.isFinite(seconds)
            ? Date.now() + Math.max(0, seconds) * 1000
            : Date.parse(retry);
      if (Number.isFinite(retryTime))
        blockedUntil.current = Math.max(blockedUntil.current, retryTime);
      if (!result.ok)
        throw new Error(
          "Auction prices are temporarily unavailable. Retry later or enter a manual override.",
        );
      const parsed = auctionResponseSchema.parse(await result.json());
      if (request.current !== controller) return;
      setResponse(parsed);
      blockedUntil.current = Math.max(
        blockedUntil.current,
        parsed.refresh.nextRefreshAt,
      );
    } catch {
      if (request.current !== controller) return;
      blockedUntil.current = Math.max(blockedUntil.current, Date.now() + 30000);
      setError(
        "Auction prices are temporarily unavailable. Retry later or enter a manual override.",
      );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setRetryAt(blockedUntil.current);
        setLoading(false);
        setNow(Date.now());
      }
    }
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    void refresh();
    return () => {
      clearInterval(interval);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);
  const context = useMemo(
    () => ({ report: response?.report ?? null, now }),
    [response, now],
  );
  return {
    context,
    response,
    loading,
    error,
    refresh,
    retryAt,
    canRefresh: !loading && now >= retryAt,
    now,
  };
}
