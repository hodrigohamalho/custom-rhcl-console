/**
 * Deep-linking into the RHCL Grafana instance (req041).
 *
 * The dashboards live in the `rhcl-grafana` namespace and expose URL
 * template variables for `gateway`, `httproute`, `consumer`, `namespace`
 * and `pod`. We auto-discover the Grafana Route host so links work on any
 * cluster where the stack from `tests/req041/manifests/` was applied.
 *
 * When Grafana isn't installed (Route missing), the hook returns
 * `available: false` so callers can render a disabled button + tooltip
 * instead of a dead link.
 */
import {
  useK8sWatchResource,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';

const GRAFANA_NS = 'rhcl-grafana';
const GRAFANA_ROUTE = 'rhcl-grafana-route';

interface RouteResource extends K8sResourceCommon {
  spec?: { host?: string };
}

export type GrafanaDashboard =
  | 'api-overview'
  | 'api-consumers'
  | 'authorino'
  | 'limitador';

const DASHBOARD_UIDS: Record<GrafanaDashboard, string> = {
  'api-overview': 'rhcl-api-overview',
  'api-consumers': 'rhcl-api-consumers',
  authorino: 'rhcl-authorino',
  limitador: 'rhcl-limitador',
};

/**
 * Variables understood by the dashboards. Anything else is ignored.
 * Multi-value vars (e.g. `consumer` filtered to several keys) can be passed
 * as arrays — Grafana repeats `?var-foo=a&var-foo=b`.
 */
export type GrafanaVars = Partial<{
  gateway: string | string[];
  httproute: string | string[];
  consumer: string | string[];
  namespace: string | string[];
  pod: string | string[];
}>;

export interface GrafanaLink {
  /** Full https URL to the dashboard, with variables, or null when unavailable. */
  url: string | null;
  /** True while the Route lookup is in flight. */
  loading: boolean;
  /** False when Grafana isn't installed in this cluster. */
  available: boolean;
}

function buildVarQuery(vars: GrafanaVars): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((v) => v && params.append(`var-${key}`, v));
    } else {
      params.append(`var-${key}`, value);
    }
  }
  return params.toString();
}

/**
 * Hook that resolves the deep-link URL to a RHCL Grafana dashboard.
 *
 * Falls back to `available: false` when the `rhcl-grafana-route` Route
 * isn't present (Grafana stack not deployed), so the caller can render a
 * disabled control rather than a broken link.
 */
export function useGrafanaLink(
  dashboard: GrafanaDashboard,
  vars: GrafanaVars = {},
): GrafanaLink {
  const [route, loaded, loadError] = useK8sWatchResource<RouteResource>({
    groupVersionKind: { group: 'route.openshift.io', version: 'v1', kind: 'Route' },
    namespace: GRAFANA_NS,
    name: GRAFANA_ROUTE,
    isList: false,
  });

  if (!loaded && !loadError) {
    return { url: null, loading: true, available: false };
  }

  const host = route?.spec?.host;
  if (loadError || !host) {
    return { url: null, loading: false, available: false };
  }

  const uid = DASHBOARD_UIDS[dashboard];
  const query = buildVarQuery(vars);
  const url = `https://${host}/d/${uid}/${uid}${query ? `?${query}` : ''}`;

  return { url, loading: false, available: true };
}
