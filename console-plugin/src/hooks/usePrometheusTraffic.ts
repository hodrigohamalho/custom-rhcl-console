import { useState, useEffect, useCallback, useRef } from 'react';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  requestRateQuery,
  statusCodeRateQuery,
  latencyPercentileQuery,
  successRateQuery,
} from '../utils/prometheusQueries';

export interface TrafficData {
  requestRate1m: number | null;
  requestRate5m: number | null;
  successRate: number | null;
  rate2xx: number | null;
  rate4xx: number | null;
  rate5xx: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  latencyP99: number | null;
}

interface UsePrometheusTrafficResult {
  data: TrafficData;
  loaded: boolean;
  error: Error | null;
  metricsAvailable: boolean;
}

const EMPTY_TRAFFIC: TrafficData = {
  requestRate1m: null,
  requestRate5m: null,
  successRate: null,
  rate2xx: null,
  rate4xx: null,
  rate5xx: null,
  latencyP50: null,
  latencyP95: null,
  latencyP99: null,
};

/**
 * Try the tenancy endpoint first (works for all users), then fall back to
 * the cluster-wide endpoint (works for cluster-admins when tenancy is unavailable).
 */
async function fetchPrometheusQuery(
  query: string,
  namespace: string,
): Promise<{ value: number | null; endpointDown: boolean }> {
  const endpoints = [
    `/api/prometheus-tenancy/api/v1/query?namespace=${encodeURIComponent(namespace)}&query=${encodeURIComponent(query)}`,
    `/api/prometheus/api/v1/query?query=${encodeURIComponent(query)}`,
  ];

  for (const url of endpoints) {
    try {
      const response = await consoleFetch(url);
      const json = await response.json();
      const val = json?.data?.result?.[0]?.value?.[1];
      return { value: val ? parseFloat(val) : null, endpointDown: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isEndpointError = /40[13]|403|404|503/.test(msg);
      if (!isEndpointError) {
        console.warn('[RHCL metrics] query failed:', query, msg);
        return { value: null, endpointDown: false };
      }
    }
  }

  return { value: null, endpointDown: true };
}

export function usePrometheusTraffic(
  kind: 'Gateway' | 'HTTPRoute',
  name: string,
  namespace: string,
  pollInterval = 30000,
  gatewayClass?: string,
): UsePrometheusTrafficResult {
  const [data, setData] = useState<TrafficData>(EMPTY_TRAFFIC);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [metricsAvailable, setMetricsAvailable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!name || !namespace) return;

    const queries = {
      requestRate1m: requestRateQuery(namespace, name, kind, '1m', gatewayClass),
      requestRate5m: requestRateQuery(namespace, name, kind, '5m', gatewayClass),
      successRate: successRateQuery(namespace, name, kind, '5m', gatewayClass),
      rate2xx: statusCodeRateQuery(namespace, name, kind, '2xx', '5m', gatewayClass),
      rate4xx: statusCodeRateQuery(namespace, name, kind, '4xx', '5m', gatewayClass),
      rate5xx: statusCodeRateQuery(namespace, name, kind, '5xx', '5m', gatewayClass),
      latencyP50: latencyPercentileQuery(namespace, name, kind, 0.5, '5m', gatewayClass),
      latencyP95: latencyPercentileQuery(namespace, name, kind, 0.95, '5m', gatewayClass),
      latencyP99: latencyPercentileQuery(namespace, name, kind, 0.99, '5m', gatewayClass),
    };

    try {
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const { value, endpointDown } = await fetchPrometheusQuery(query, namespace);
          return [key, value, endpointDown] as const;
        }),
      );

      const anyEndpointDown = results.some(([, , down]) => down);
      const allNull = results.every(([, val]) => val === null);

      const newData = { ...EMPTY_TRAFFIC };
      for (const [key, value] of results) {
        (newData as Record<string, number | null>)[key] = value;
      }
      setData(newData);
      setLoaded(true);
      setError(null);
      setMetricsAvailable(!anyEndpointDown);

      if (allNull && !anyEndpointDown) {
        console.warn(
          '[RHCL metrics] All queries returned no data. Verify that user-workload monitoring is enabled and metrics exist. Sample query:',
          Object.values(queries)[0],
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.warn('[RHCL metrics] Unexpected fetch error:', err.message);
      setError(err);
      setLoaded(true);
      setMetricsAvailable(false);
    }
  }, [kind, name, namespace, gatewayClass]);

  useEffect(() => {
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMetrics, pollInterval]);

  return { data, loaded, error, metricsAvailable };
}
