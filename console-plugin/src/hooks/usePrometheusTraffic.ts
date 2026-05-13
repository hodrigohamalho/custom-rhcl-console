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
 * Build a list of Prometheus endpoints to try, in priority order:
 *   1. Tenancy endpoint for each candidate namespace (handles non-admin users)
 *   2. Cluster-wide endpoint (handles cluster-admins)
 */
function buildEndpoints(path: string, queryString: string, namespaces: string[]): string[] {
  const unique = [...new Set(namespaces.filter(Boolean))];
  const urls: string[] = [];
  for (const ns of unique) {
    urls.push(`/api/prometheus-tenancy${path}?namespace=${encodeURIComponent(ns)}&${queryString}`);
  }
  urls.push(`/api/prometheus${path}?${queryString}`);
  return urls;
}

async function fetchPrometheusQuery(
  query: string,
  namespaces: string[],
): Promise<{ value: number | null; endpointDown: boolean }> {
  const endpoints = buildEndpoints('/api/v1/query', `query=${encodeURIComponent(query)}`, namespaces);

  let anyReachable = false;
  for (const url of endpoints) {
    try {
      const response = await consoleFetch(url);
      anyReachable = true;
      const json = await response.json();
      const val = json?.data?.result?.[0]?.value?.[1];
      if (val) {
        return { value: parseFloat(val), endpointDown: false };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isEndpointError = /40[13]|403|404|503/.test(msg);
      if (!isEndpointError) {
        console.warn('[RHCL metrics] query failed:', query, msg);
        return { value: null, endpointDown: false };
      }
    }
  }

  return { value: null, endpointDown: !anyReachable };
}

export function usePrometheusTraffic(
  kind: 'Gateway' | 'HTTPRoute',
  name: string,
  namespace: string,
  pollInterval = 30000,
  gatewayClass?: string,
  backendServices?: string[],
  metricsNamespaces?: string[],
): UsePrometheusTrafficResult {
  const [data, setData] = useState<TrafficData>(EMPTY_TRAFFIC);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [metricsAvailable, setMetricsAvailable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!name || !namespace) return;

    const nsToTry = metricsNamespaces?.length ? metricsNamespaces : [namespace];
    const opts = { namespace, name, kind, gatewayClass, backendServices };
    const queries = {
      requestRate1m: requestRateQuery(opts, '1m'),
      requestRate5m: requestRateQuery(opts, '5m'),
      successRate: successRateQuery(opts),
      rate2xx: statusCodeRateQuery(opts, '2xx'),
      rate4xx: statusCodeRateQuery(opts, '4xx'),
      rate5xx: statusCodeRateQuery(opts, '5xx'),
      latencyP50: latencyPercentileQuery(opts, 0.5),
      latencyP95: latencyPercentileQuery(opts, 0.95),
      latencyP99: latencyPercentileQuery(opts, 0.99),
    };

    try {
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const { value, endpointDown } = await fetchPrometheusQuery(query, nsToTry);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, name, namespace, gatewayClass, backendServices?.join(','), metricsNamespaces?.join(',')]);

  useEffect(() => {
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMetrics, pollInterval]);

  return { data, loaded, error, metricsAvailable };
}
