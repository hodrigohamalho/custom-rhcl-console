/**
 * PromQL query builders for Istio telemetry metrics scraped by RHCL user-workload monitoring.
 *
 * Assumed metrics (from Istio / Kuadrant ServiceMonitor):
 *   - istio_requests_total                          — request counter with response code
 *   - istio_request_duration_milliseconds_bucket    — latency histogram
 *
 * Expected labels:
 *   - reporter                        — "source" (gateway) or "destination" (backend)
 *   - namespace                       — pod namespace (used for Gateway filtering)
 *   - destination_service_namespace   — target service namespace (used for HTTPRoute filtering)
 *   - source_workload                 — Gateway workload name: "<gateway_name>-<gateway_class>"
 *   - destination_service_name        — K8s Service name (from HTTPRoute backendRefs)
 *   - response_code                   — HTTP status code (e.g. "200", "404")
 *
 * To verify which metrics exist, run in the Thanos/Prometheus UI:
 *   istio_requests_total{namespace="<gateway-ns>"}
 *   istio_requests_total{destination_service_namespace="<route-ns>"}
 */

interface QueryOpts {
  namespace: string;
  name: string;
  kind: 'Gateway' | 'HTTPRoute';
  gatewayClass?: string;
  backendServices?: string[];
}

export function requestRateQuery(
  opts: QueryOpts,
  window: '1m' | '5m' = '5m',
): string {
  const filter = kindFilter(opts);
  return `sum(rate(istio_requests_total{${filter}}[${window}]))`;
}

export function statusCodeRateQuery(
  opts: QueryOpts,
  codeClass: '2xx' | '4xx' | '5xx',
  window = '5m',
): string {
  const codePattern = codeClass === '2xx' ? '2..' : codeClass === '4xx' ? '4..' : '5..';
  const filter = kindFilter(opts);
  return `sum(rate(istio_requests_total{${filter}, response_code=~"${codePattern}"}[${window}]))`;
}

export function latencyPercentileQuery(
  opts: QueryOpts,
  percentile: 0.5 | 0.95 | 0.99,
  window = '5m',
): string {
  const filter = kindFilter(opts);
  return `histogram_quantile(${percentile}, sum(rate(istio_request_duration_milliseconds_bucket{${filter}}[${window}])) by (le))`;
}

export function successRateQuery(
  opts: QueryOpts,
  window = '5m',
): string {
  const filter = kindFilter(opts);
  return `sum(rate(istio_requests_total{${filter}, response_code=~"[23].."}[${window}])) / sum(rate(istio_requests_total{${filter}}[${window}])) * 100`;
}

export function trafficOverTimeQuery(
  opts: QueryOpts,
  window = '5m',
): string {
  const filter = kindFilter(opts);
  return `sum(rate(istio_requests_total{${filter}}[${window}]))`;
}

export function statusCodeRateRangeQuery(
  opts: QueryOpts,
  codeClass: '2xx' | '4xx' | '5xx',
  window = '5m',
): string {
  const codePattern = codeClass === '2xx' ? '2..' : codeClass === '4xx' ? '4..' : '5..';
  const filter = kindFilter(opts);
  return `sum(rate(istio_requests_total{${filter}, response_code=~"${codePattern}"}[${window}]))`;
}

export function latencyPercentileRangeQuery(
  opts: QueryOpts,
  percentile: 0.5 | 0.95 | 0.99,
  window = '5m',
): string {
  const filter = kindFilter(opts);
  return `histogram_quantile(${percentile}, sum(rate(istio_request_duration_milliseconds_bucket{${filter}}[${window}])) by (le))`;
}

function kindFilter({ namespace, name, kind, gatewayClass, backendServices }: QueryOpts): string {
  if (kind === 'Gateway') {
    const workload = gatewayClass ? `${name}-${gatewayClass}` : name;
    return `reporter="source", namespace="${namespace}", source_workload="${workload}"`;
  }
  const services = backendServices?.length ? backendServices : [name];
  const svcMatcher = services.length === 1
    ? `destination_service_name="${services[0]}"`
    : `destination_service_name=~"${services.join('|')}"`;
  return `destination_service_namespace="${namespace}", ${svcMatcher}`;
}
