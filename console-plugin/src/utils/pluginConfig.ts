/**
 * Runtime config for the plugin, sourced from a ConfigMap the cluster
 * admin maintains alongside the plugin Deployment.
 *
 *   apiVersion: v1
 *   kind: ConfigMap
 *   metadata:
 *     name: custom-rhcl-console-config
 *     namespace: custom-rhcl-console
 *   data:
 *     # Where the Grafana that hosts the RHCL dashboards lives. Defaults
 *     # to the in-cluster instance the role provisions (rhcl-grafana /
 *     # rhcl-grafana-route).
 *     grafanaNamespace: monitoring
 *     grafanaRouteName: grafana
 *     # UID prefix on the dashboards in *this* Grafana — leave default
 *     # ("rhcl-") when the cluster admin imported the role's dashboard
 *     # JSONs unchanged. Override to point at a renamed copy.
 *     grafanaDashboardPrefix: rhcl-
 *     # Tempo gateway (TempoStack openshift-mode). Default points at
 *     # the in-cluster TempoStack the observability role provisions.
 *     tempoNamespace: tempo
 *     tempoGatewayRouteName: tempo-tempo-rhcl-gateway
 *     tempoStackName: tempo-rhcl
 *
 * Every field is optional — the hooks fall back to the original
 * hard-coded values when the ConfigMap is missing or a field is unset,
 * so deploying without the ConfigMap is identical to today's behavior.
 *
 * Why a ConfigMap and not env vars: federated console plugins run in
 * the browser, so they can't read pod env — the only runtime config
 * channel available is the Kubernetes API.
 */
import {
  useK8sWatchResource,
  K8sResourceCommon,
} from '@openshift-console/dynamic-plugin-sdk';

const CONFIG_NAMESPACE = 'custom-rhcl-console';
const CONFIG_NAME = 'custom-rhcl-console-config';

export interface PluginConfig {
  grafanaNamespace?: string;
  grafanaRouteName?: string;
  grafanaDashboardPrefix?: string;
  tempoNamespace?: string;
  tempoGatewayRouteName?: string;
  tempoStackName?: string;
}

interface ConfigMapResource extends K8sResourceCommon {
  data?: PluginConfig;
}

export interface PluginConfigResult {
  config: PluginConfig;
  loaded: boolean;
}

/**
 * Hook that watches the plugin's runtime ConfigMap. Returns an empty
 * object when missing — every caller falls back to its default.
 */
export function usePluginConfig(): PluginConfigResult {
  const [cm, loaded] = useK8sWatchResource<ConfigMapResource>({
    groupVersionKind: { version: 'v1', kind: 'ConfigMap' },
    namespace: CONFIG_NAMESPACE,
    name: CONFIG_NAME,
    isList: false,
  });
  return { config: cm?.data || {}, loaded };
}
