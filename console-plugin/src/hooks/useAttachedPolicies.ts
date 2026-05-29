import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  AuthPolicyGVK,
  RateLimitPolicyGVK,
  TokenRateLimitPolicyGVK,
  DNSPolicyGVK,
  TLSPolicyGVK,
} from '../models';
import {
  AnyPolicy,
  AuthPolicy,
  RateLimitPolicy,
  TokenRateLimitPolicy,
  DNSPolicy,
  TLSPolicy,
  PolicyAttachment,
  PolicyKind,
} from '../types';
import { policyAttachesTo, primaryTargetRef } from '../utils/policyTargets';

interface UseAttachedPoliciesResult {
  policies: PolicyAttachment[];
  loaded: boolean;
  error: Error | undefined;
}

/**
 * Discover policies attached to a Gateway API target (Gateway or HTTPRoute).
 *
 * Watches each known policy kind in the target's namespace AND in the parent
 * Gateway's namespace (when supplied). This matters because Gateway-level
 * policies (e.g. TLSPolicy/DNSPolicy) typically live in the Gateway's
 * namespace (`openshift-ingress` in the lab) while HTTPRoutes live in the app
 * namespace; the previous single-namespace watch missed cross-ns attachments.
 *
 * Attachment is evaluated via `policyAttachesTo`, which understands both the
 * current `spec.targetRefs[]` (GEP-2649) and the legacy singular `spec.targetRef`.
 *
 * Results are de-duplicated by UID — when `gatewayNamespace === targetNamespace`
 * the second batch of watches returns the same objects and dedup keeps a single
 * entry per policy.
 *
 * NOTE: this hook currently knows about 5 policy kinds (Auth, RateLimit,
 * TokenRateLimit, DNS, TLS). Migrating to fully discovery-driven enumeration
 * (per GEP-713 — `gateway.networking.k8s.io/policy` CRD label) is tracked as
 * SPECIFICATION §12 Q8.
 */
export function useAttachedPolicies(
  targetKind: string,
  targetName: string,
  targetNamespace: string,
  gatewayNamespace?: string,
): UseAttachedPoliciesResult {
  // Resolve the secondary namespace once. When the caller passes a Gateway ns
  // that equals the target ns (or omits it), we still call the same hooks so
  // React's hook-order rule is preserved; the dedup-by-UID below collapses the
  // duplicates.
  const altNs = gatewayNamespace && gatewayNamespace !== targetNamespace
    ? gatewayNamespace
    : targetNamespace;

  // Target-namespace watches (always called).
  const [authPolicies, authLoaded, authErr] = useK8sWatchResource<AuthPolicy[]>({
    groupVersionKind: AuthPolicyGVK,
    isList: true,
    namespace: targetNamespace,
  });
  const [rlPolicies, rlLoaded, rlErr] = useK8sWatchResource<RateLimitPolicy[]>({
    groupVersionKind: RateLimitPolicyGVK,
    isList: true,
    namespace: targetNamespace,
  });
  const [trlPolicies, trlLoaded, trlErr] = useK8sWatchResource<TokenRateLimitPolicy[]>({
    groupVersionKind: TokenRateLimitPolicyGVK,
    isList: true,
    namespace: targetNamespace,
  });
  const [dnsPolicies, dnsLoaded, dnsErr] = useK8sWatchResource<DNSPolicy[]>({
    groupVersionKind: DNSPolicyGVK,
    isList: true,
    namespace: targetNamespace,
  });
  const [tlsPolicies, tlsLoaded, tlsErr] = useK8sWatchResource<TLSPolicy[]>({
    groupVersionKind: TLSPolicyGVK,
    isList: true,
    namespace: targetNamespace,
  });

  // Alt-namespace watches — same shape, unconditionally called to honour
  // React's hook ordering. When altNs === targetNamespace the SDK serves the
  // same data and dedup handles it.
  const [authPoliciesAlt, authLoadedAlt, authErrAlt] = useK8sWatchResource<AuthPolicy[]>({
    groupVersionKind: AuthPolicyGVK,
    isList: true,
    namespace: altNs,
  });
  const [rlPoliciesAlt, rlLoadedAlt, rlErrAlt] = useK8sWatchResource<RateLimitPolicy[]>({
    groupVersionKind: RateLimitPolicyGVK,
    isList: true,
    namespace: altNs,
  });
  const [trlPoliciesAlt, trlLoadedAlt, trlErrAlt] = useK8sWatchResource<TokenRateLimitPolicy[]>({
    groupVersionKind: TokenRateLimitPolicyGVK,
    isList: true,
    namespace: altNs,
  });
  const [dnsPoliciesAlt, dnsLoadedAlt, dnsErrAlt] = useK8sWatchResource<DNSPolicy[]>({
    groupVersionKind: DNSPolicyGVK,
    isList: true,
    namespace: altNs,
  });
  const [tlsPoliciesAlt, tlsLoadedAlt, tlsErrAlt] = useK8sWatchResource<TLSPolicy[]>({
    groupVersionKind: TLSPolicyGVK,
    isList: true,
    namespace: altNs,
  });

  const loaded =
    authLoaded && rlLoaded && trlLoaded && dnsLoaded && tlsLoaded &&
    authLoadedAlt && rlLoadedAlt && trlLoadedAlt && dnsLoadedAlt && tlsLoadedAlt;

  const errors = [
    authErr, rlErr, trlErr, dnsErr, tlsErr,
    authErrAlt, rlErrAlt, trlErrAlt, dnsErrAlt, tlsErrAlt,
  ].filter(Boolean);
  // Report an error only when every watch failed; partial failures (e.g. RBAC
  // denies one kind) should not blank the whole view.
  const error = errors.length === 10 ? (errors[0] as Error) : undefined;

  const seen = new Set<string>();
  const policies: PolicyAttachment[] = [];

  const addMatching = (items: AnyPolicy[] | undefined, kind: PolicyKind) => {
    for (const p of items || []) {
      const uid = p.metadata?.uid;
      if (!uid || seen.has(uid)) continue;
      if (!policyAttachesTo(p, targetKind, targetName, targetNamespace)) continue;
      seen.add(uid);

      const conditions = p.status?.conditions || [];
      const isOverridden = conditions.some(
        (c) => c.type === 'Overridden' && c.status === 'True',
      );
      const isEnforced = conditions.some(
        (c) => c.type === 'Enforced' && c.status === 'True',
      );

      // Surface the first reference as the "primary" for UI rows that only show
      // one targetRef. Components that need every reference should call
      // policyTargetRefs(policy) directly.
      const targetRef = primaryTargetRef(p);
      if (!targetRef) continue;

      policies.push({
        policy: p,
        policyKind: kind,
        targetRef,
        conditions,
        isOverridden,
        isEnforced,
      });
    }
  };

  // Target ns first, then alt ns. Dedup ensures policies in altNs that already
  // appeared in targetNs aren't double-counted.
  addMatching(authPolicies, 'AuthPolicy');
  addMatching(rlPolicies, 'RateLimitPolicy');
  addMatching(trlPolicies, 'TokenRateLimitPolicy');
  addMatching(dnsPolicies, 'DNSPolicy');
  addMatching(tlsPolicies, 'TLSPolicy');

  addMatching(authPoliciesAlt, 'AuthPolicy');
  addMatching(rlPoliciesAlt, 'RateLimitPolicy');
  addMatching(trlPoliciesAlt, 'TokenRateLimitPolicy');
  addMatching(dnsPoliciesAlt, 'DNSPolicy');
  addMatching(tlsPoliciesAlt, 'TLSPolicy');

  return { policies, loaded, error };
}
