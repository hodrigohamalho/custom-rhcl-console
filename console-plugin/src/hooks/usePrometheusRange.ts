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
 * Build a list of Prometheus endpoints to try, in priority order:
 *   1. Tenancy endpoint for each candidate namespace (handles non-admin users)
 *   2. Cluster-wide endpoint (handles cluster-admins)
 */
function buildRangeEndpoints(qs: URLSearchParams, namespaces: string[]): string[] {
  const unique = [...new Set(namespaces.filter(Boolean))];
  const urls: string[] = [];
  for (const ns of unique) {
    urls.push(`/api/prometheus-tenancy/api/v1/query_range?namespace=${encodeURIComponent(ns)}&${qs}`);
  }
  urls.push(`/api/prometheus/api/v1/query_range?${qs}`);
  return urls;
}

async function fetchRangeQuery(
  query: string,
  namespaces: string[],
  start: number,
  end: number,
  step: number,
): Promise<{ values: [number, string][]; endpointDown: boolean }> {
  const qs = new URLSearchParams({
    query,
    start: String(start),
    end: String(end),
    step: String(step),
  });
  const endpoints = buildRangeEndpoints(qs, namespaces);

  let anyReachable = false;
  for (const url of endpoints) {
    try {
      const response = await consoleFetch(url);
      anyReachable = true;
      const json = await response.json();
      const values: [number, string][] = json?.data?.result?.[0]?.values || [];
      if (values.length > 0) {
        return { values, endpointDown: false };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isEndpointError = /40[13]|403|404|503/.test(msg);
      if (!isEndpointError) {
        console.warn('[RHCL metrics] range query failed:', query, msg);
        return { values: [], endpointDown: false };
      }
    }
  }

  return { values: [], endpointDown: !anyReachable };
}

export function usePrometheusRange(
  queries: RangeQuerySpec[],
  namespace: string,
  durationSeconds = 3600,
  stepSeconds = 60,
  pollInterval = 30000,
  metricsNamespaces?: string[],
): UsePrometheusRangeResult {
  const [series, setSeries] = useState<TimeSeries[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [metricsAvailable, setMetricsAvailable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const queriesKey = queries.map((q) => q.query).join('|');

  const fetchRange = useCallback(async () => {
    if (queries.length === 0) return;

    const nsToTry = metricsNamespaces?.length ? metricsNamespaces : [namespace];
    const now = Math.floor(Date.now() / 1000);
    const start = now - durationSeconds;

    try {
      let anyEndpointDown = false;

      const results = await Promise.all(
        queries.map(async (spec) => {
          const { values, endpointDown } = await fetchRangeQuery(
            spec.query,
            nsToTry,
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
  }, [queriesKey, namespace, durationSeconds, stepSeconds, metricsNamespaces?.join(',')]);

  useEffect(() => {
    fetchRange();
    intervalRef.current = setInterval(fetchRange, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRange, pollInterval]);

  return { series, loaded, metricsAvailable };
}
