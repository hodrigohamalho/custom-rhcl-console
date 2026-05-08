import { useState, useEffect, useCallback, useRef } from 'react';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

export interface TimeSeries {
  label: string;
  data: { x: Date; y: number }[];
}

interface UsePrometheusRangeResult {
  series: TimeSeries[];
  loaded: boolean;
  metricsAvailable: boolean;
}

interface RangeQuerySpec {
  label: string;
  query: string;
}

/**
 * Try the tenancy endpoint first (works for all users), then fall back to
 * the cluster-wide endpoint (works for cluster-admins when tenancy is unavailable).
 */
async function fetchRangeQuery(
  query: string,
  namespace: string,
  start: number,
  end: number,
  step: number,
): Promise<{ values: [number, string][]; endpointDown: boolean }> {
  const baseParams = {
    query,
    start: String(start),
    end: String(end),
    step: String(step),
  };

  const endpoints = [
    `/api/prometheus-tenancy/api/v1/query_range?namespace=${encodeURIComponent(namespace)}&${new URLSearchParams(baseParams)}`,
    `/api/prometheus/api/v1/query_range?${new URLSearchParams(baseParams)}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await consoleFetch(url);
      const json = await response.json();
      const values: [number, string][] = json?.data?.result?.[0]?.values || [];
      return { values, endpointDown: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isEndpointError = /40[13]|403|404|503/.test(msg);
      if (!isEndpointError) {
        console.warn('[RHCL metrics] range query failed:', query, msg);
        return { values: [], endpointDown: false };
      }
    }
  }

  return { values: [], endpointDown: true };
}

export function usePrometheusRange(
  queries: RangeQuerySpec[],
  namespace: string,
  durationSeconds = 3600,
  stepSeconds = 60,
  pollInterval = 30000,
): UsePrometheusRangeResult {
  const [series, setSeries] = useState<TimeSeries[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [metricsAvailable, setMetricsAvailable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const queriesKey = queries.map((q) => q.query).join('|');

  const fetchRange = useCallback(async () => {
    if (queries.length === 0) return;

    const now = Math.floor(Date.now() / 1000);
    const start = now - durationSeconds;

    try {
      let anyEndpointDown = false;

      const results = await Promise.all(
        queries.map(async (spec) => {
          const { values, endpointDown } = await fetchRangeQuery(
            spec.query,
            namespace,
            start,
            now,
            stepSeconds,
          );
          if (endpointDown) anyEndpointDown = true;
          return {
            label: spec.label,
            data: values.map(([ts, val]) => ({
              x: new Date(ts * 1000),
              y: parseFloat(val) || 0,
            })),
          } as TimeSeries;
        }),
      );

      setSeries(results);
      setLoaded(true);
      setMetricsAvailable(!anyEndpointDown);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn('[RHCL metrics] Unexpected range fetch error:', err.message);
      setMetricsAvailable(false);
      setLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queriesKey, namespace, durationSeconds, stepSeconds]);

  useEffect(() => {
    fetchRange();
    intervalRef.current = setInterval(fetchRange, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRange, pollInterval]);

  return { series, loaded, metricsAvailable };
}
