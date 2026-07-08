/**
 * Manifest generators — pure functions WizardState → K8s objects.
 *
 * Every generator returns `null` when the state says the resource
 * shouldn't exist (e.g. no DNSPolicy for internal APIs), so callers
 * can `filter(Boolean)` the full list to know exactly what the wizard
 * will create. The same list feeds three surfaces: the sidebar's
 * Generated Resources, the Review screen's YAML and the final
 * k8sCreate() loop — one source of truth, no drift.
 */
import { dump } from 'js-yaml';
import { WizardState, apiSlug } from './wizardTypes';

export interface GeneratedResource {
  kind: string;
  name: string;
  namespace?: string;
  /** apiGroup + apiVersion for the k8sCreate model. */
  apiGroup: string;
  apiVersion: string;
  plural: string;
  manifest: Record<string, unknown>;
}

function gatewayNamespace(s: WizardState): string {
  return s.useExistingGateway
    ? s.existingGatewayNamespace || 'rhcl-gateways'
    : s.namespace || 'rhcl-gateways';
}

function gatewayName(s: WizardState): string {
  return s.useExistingGateway ? s.existingGatewayName : s.gatewayName || `${apiSlug(s)}-gw`;
}

// ---------------------------------------------------------------------------

export function genGateway(s: WizardState): GeneratedResource | null {
  if (s.useExistingGateway) return null;
  const name = gatewayName(s);
  const ns = gatewayNamespace(s);
  const listeners: Record<string, unknown>[] = [
    {
      name: s.listenerProtocol === 'HTTPS' ? 'https' : 'http',
      hostname: s.hostname || undefined,
      port: s.listenerPort,
      protocol: s.listenerProtocol,
      allowedRoutes: { namespaces: { from: 'All' } },
      ...(s.tlsEnabled && s.listenerProtocol === 'HTTPS'
        ? { tls: { mode: 'Terminate', certificateRefs: [{ name: `${name}-tls` }] } }
        : {}),
    },
  ];
  return {
    kind: 'Gateway',
    name,
    namespace: ns,
    apiGroup: 'gateway.networking.k8s.io',
    apiVersion: 'v1',
    plural: 'gateways',
    manifest: {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'Gateway',
      metadata: { name, namespace: ns },
      spec: {
        gatewayClassName: 'istio',
        listeners,
      },
    },
  };
}

/** Gateway API requires absolute paths — normalise whatever the user typed. */
function normalizePath(p: string): string {
  const trimmed = (p || '').trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function genHTTPRoute(s: WizardState): GeneratedResource | null {
  if (!s.serviceName) return null;
  const name = `${apiSlug(s)}-route`;
  const ns = s.namespace;
  const rules = s.routes.map((r) => ({
    matches: [
      {
        path: { type: r.matchType, value: normalizePath(r.path) },
        ...(r.method !== 'ANY' ? { method: r.method } : {}),
      },
    ],
    backendRefs: [{ name: s.serviceName, port: s.servicePort ?? 80 }],
  }));
  return {
    kind: 'HTTPRoute',
    name,
    namespace: ns,
    apiGroup: 'gateway.networking.k8s.io',
    apiVersion: 'v1',
    plural: 'httproutes',
    manifest: {
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name, namespace: ns },
      spec: {
        parentRefs: [
          {
            name: gatewayName(s),
            namespace: gatewayNamespace(s),
          },
        ],
        ...(s.hostname ? { hostnames: [s.hostname] } : {}),
        rules,
      },
    },
  };
}

export function genAuthPolicy(s: WizardState): GeneratedResource | null {
  if (s.authMode === 'anonymous' || !s.serviceName) return null;
  const name = `${apiSlug(s)}-auth`;
  const ns = s.namespace;

  let authentication: Record<string, unknown>;
  if (s.authMode === 'api-key') {
    authentication = {
      'api-key-users': {
        apiKey: {
          selector: { matchLabels: { app: `${apiSlug(s)}-apikey` } },
          allNamespaces: true,
        },
        credentials: { customHeader: { name: s.apiKeyHeader || 'api-key' } },
      },
    };
  } else if (s.authMode === 'jwt') {
    authentication = {
      jwt: {
        jwt: {
          issuerUrl: s.jwtIssuer,
          ...(s.jwksUrl ? { jwksUrl: s.jwksUrl } : {}),
        },
        ...(s.jwtAudience ? { audiences: [s.jwtAudience] } : {}),
      },
    };
  } else {
    // oidc
    authentication = {
      oidc: {
        jwt: { issuerUrl: s.oidcDiscoveryUrl },
      },
    };
  }

  return {
    kind: 'AuthPolicy',
    name,
    namespace: ns,
    apiGroup: 'kuadrant.io',
    apiVersion: 'v1',
    plural: 'authpolicies',
    manifest: {
      apiVersion: 'kuadrant.io/v1',
      kind: 'AuthPolicy',
      metadata: { name, namespace: ns },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'HTTPRoute',
          name: `${apiSlug(s)}-route`,
        },
        rules: { authentication },
      },
    },
  };
}

export function genRateLimitPolicy(s: WizardState): GeneratedResource | null {
  if (!s.rateLimitEnabled || !s.serviceName) return null;
  const name = `${apiSlug(s)}-ratelimit`;
  const ns = s.namespace;
  return {
    kind: 'RateLimitPolicy',
    name,
    namespace: ns,
    apiGroup: 'kuadrant.io',
    apiVersion: 'v1',
    plural: 'ratelimitpolicies',
    manifest: {
      apiVersion: 'kuadrant.io/v1',
      kind: 'RateLimitPolicy',
      metadata: { name, namespace: ns },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'HTTPRoute',
          name: `${apiSlug(s)}-route`,
        },
        limits: {
          default: {
            rates: [{ limit: s.rateLimit, window: s.rateWindow }],
          },
        },
      },
    },
  };
}

export function genTokenRateLimitPolicy(s: WizardState): GeneratedResource | null {
  if (!s.tokenLimitEnabled || !s.serviceName) return null;
  const name = `${apiSlug(s)}-tokenlimit`;
  const ns = s.namespace;
  return {
    kind: 'TokenRateLimitPolicy',
    name,
    namespace: ns,
    apiGroup: 'kuadrant.io',
    apiVersion: 'v1alpha1',
    plural: 'tokenratelimitpolicies',
    manifest: {
      apiVersion: 'kuadrant.io/v1alpha1',
      kind: 'TokenRateLimitPolicy',
      metadata: { name, namespace: ns },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'HTTPRoute',
          name: `${apiSlug(s)}-route`,
        },
        limits: {
          default: {
            rates: [{ limit: s.tokenLimit, window: s.tokenWindow }],
          },
        },
      },
    },
  };
}

export function genDNSPolicy(s: WizardState): GeneratedResource | null {
  if (!s.dnsEnabled) return null;
  const gwName = gatewayName(s);
  if (!gwName) return null;
  const name = `${apiSlug(s)}-dns`;
  const ns = gatewayNamespace(s);
  return {
    kind: 'DNSPolicy',
    name,
    namespace: ns,
    apiGroup: 'kuadrant.io',
    apiVersion: 'v1',
    plural: 'dnspolicies',
    manifest: {
      apiVersion: 'kuadrant.io/v1',
      kind: 'DNSPolicy',
      metadata: { name, namespace: ns },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: gwName,
        },
        providerRefs: [{ name: 'dns-provider-credentials' }],
      },
    },
  };
}

export function genTLSPolicy(s: WizardState): GeneratedResource | null {
  if (!s.tlsPolicyEnabled) return null;
  const gwName = gatewayName(s);
  if (!gwName) return null;
  const name = `${apiSlug(s)}-tls`;
  const ns = gatewayNamespace(s);
  return {
    kind: 'TLSPolicy',
    name,
    namespace: ns,
    apiGroup: 'kuadrant.io',
    apiVersion: 'v1',
    plural: 'tlspolicies',
    manifest: {
      apiVersion: 'kuadrant.io/v1',
      kind: 'TLSPolicy',
      metadata: { name, namespace: ns },
      spec: {
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'Gateway',
          name: gwName,
        },
        issuerRef: {
          group: 'cert-manager.io',
          kind: 'ClusterIssuer',
          name: s.tlsIssuerName || 'lets-encrypt',
        },
      },
    },
  };
}

export function genAPIProduct(s: WizardState): GeneratedResource | null {
  if (!s.productEnabled || !s.serviceName) return null;
  const name = apiSlug(s);
  const ns = s.namespace;
  return {
    kind: 'APIProduct',
    name,
    namespace: ns,
    apiGroup: 'devportal.kuadrant.io',
    apiVersion: 'v1alpha1',
    plural: 'apiproducts',
    manifest: {
      apiVersion: 'devportal.kuadrant.io/v1alpha1',
      kind: 'APIProduct',
      metadata: { name, namespace: ns },
      // Field set matches the 1.4.1 CRD exactly (approvalMode enum is
      // lowercase; `openAPIRef`/`visibility` are NOT in the schema —
      // sending them either fails validation or gets silently pruned).
      spec: {
        displayName: s.displayName || name,
        description: s.description || '',
        version: s.version || 'v1',
        ...(s.tags.length > 0 ? { tags: s.tags } : {}),
        approvalMode: s.approvalMode.toLowerCase(),
        targetRef: {
          group: 'gateway.networking.k8s.io',
          kind: 'HTTPRoute',
          name: `${apiSlug(s)}-route`,
        },
      },
    },
  };
}

/** Every resource the wizard will create, in apply order. */
export function generateAll(s: WizardState): GeneratedResource[] {
  return [
    genGateway(s),
    genHTTPRoute(s),
    genAuthPolicy(s),
    genRateLimitPolicy(s),
    genTokenRateLimitPolicy(s),
    genDNSPolicy(s),
    genTLSPolicy(s),
    genAPIProduct(s),
  ].filter((r): r is GeneratedResource => r !== null);
}

export function toYaml(resources: GeneratedResource[]): string {
  return resources.map((r) => dump(r.manifest, { noRefs: true })).join('---\n');
}

/** Best-effort public URL of the API once created. */
export function exposedUrl(s: WizardState): string {
  const scheme = s.listenerProtocol === 'HTTPS' ? 'https' : 'http';
  const host = s.hostname || '<gateway-hostname>';
  const firstPath = s.routes[0]?.path || '/';
  return `${scheme}://${host}${firstPath}`;
}
