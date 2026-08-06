# Deployment

How to build, deploy, verify and remove Kuadrant Console on an OpenShift
cluster. The plugin registers with the Console under the technical name
`custom-rhcl-console`.

> **The one thing that trips everyone up:** the plugin pod serves its bundle
> over **HTTPS on port 9001** using a service-CA-signed certificate that
> OpenShift mints automatically. The Console *requires* HTTPS for plugin
> backends — deploying without the TLS mount surfaces as **"Failed to get a
> valid plugin manifest"**. The manifests below include that mount; use them.

## Prerequisites

| Requirement | Minimum |
|---|---|
| OpenShift | 4.19+ |
| Kuadrant operator (RHCL) | Installed, with at least one Gateway |
| User-workload monitoring | Optional — metric panels degrade gracefully without it |
| `oc` CLI | 4.19+ |
| Podman or Docker | To build the container image |

## 1. Build the container image

The plugin ships as an nginx container serving the static webpack output. The
two-stage Dockerfile uses `ubi9/nodejs-22` to build and `ubi9/nginx` at runtime.

```bash
cd console-plugin
podman build -t quay.io/<org>/kuadrant-console:latest .
podman push  quay.io/<org>/kuadrant-console:latest
```

## 2. Deploy the plugin server

```bash
export RHCL_CONSOLE_NS=custom-rhcl-console
export RHCL_CONSOLE_IMAGE=quay.io/<org>/kuadrant-console:latest

oc new-project "$RHCL_CONSOLE_NS" || true

cat <<EOF | oc apply -f -
apiVersion: v1
kind: Service
metadata:
  name: custom-rhcl-console
  namespace: $RHCL_CONSOLE_NS
  labels:
    app: custom-rhcl-console
  annotations:
    # Triggers the OpenShift service-CA operator to mint a TLS cert+key
    # Secret named below and rotate it before expiry. The pod mounts the
    # same Secret at /var/serving-cert.
    service.beta.openshift.io/serving-cert-secret-name: custom-rhcl-console-tls
spec:
  selector:
    app: custom-rhcl-console
  ports:
    - port: 9001
      targetPort: 9001
      protocol: TCP
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: custom-rhcl-console
  namespace: $RHCL_CONSOLE_NS
  labels:
    app: custom-rhcl-console
spec:
  replicas: 1
  selector:
    matchLabels:
      app: custom-rhcl-console
  template:
    metadata:
      labels:
        app: custom-rhcl-console
    spec:
      containers:
        - name: custom-rhcl-console
          image: $RHCL_CONSOLE_IMAGE
          imagePullPolicy: Always
          ports:
            - name: https
              containerPort: 9001
              protocol: TCP
          volumeMounts:
            - name: serving-cert
              mountPath: /var/serving-cert
              readOnly: true
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 256Mi }
      volumes:
        - name: serving-cert
          secret:
            # Matches the Service annotation above. The Secret is populated
            # asynchronously by the service-CA operator; the pod may CrashLoop
            # briefly on the very first start while the cert lands.
            secretName: custom-rhcl-console-tls
EOF
```

## 3. Register the ConsolePlugin

```bash
cat <<EOF | oc apply -f -
apiVersion: console.openshift.io/v1
kind: ConsolePlugin
metadata:
  name: custom-rhcl-console
spec:
  displayName: Connectivity Link
  backend:
    type: Service
    service:
      name: custom-rhcl-console
      namespace: $RHCL_CONSOLE_NS
      port: 9001
      basePath: /
EOF
```

## 4. Enable the plugin on the cluster

```bash
oc patch console.operator.openshift.io cluster \
  --type=json \
  --patch='[{"op":"add","path":"/spec/plugins/-","value":"custom-rhcl-console"}]'
```

After a few seconds the Console reloads and the **Connectivity Link** section
appears in the admin navigation sidebar.

For runtime configuration (Grafana / Tempo deep links, Developer Portal links,
API-key Secrets), see **[configuration.md](configuration.md)**.

## Verification

1. Confirm the pod is **Running** and the cert Secret materialized:

   ```bash
   oc -n custom-rhcl-console get pods
   oc -n custom-rhcl-console get secret custom-rhcl-console-tls
   ```

2. Open the Console → **Connectivity Link → Overview**. The Environment Health
   cards should render (or an RBAC empty state if the user lacks `list` on
   `gateway.networking.k8s.io/gateways`).
3. Open a Gateway / HTTPRoute / API Product detail page and confirm the
   **Open in Grafana** / **View trace** buttons resolve — enabled when the
   in-cluster Grafana / Tempo exist (or the runtime ConfigMap points at them),
   disabled with a tooltip otherwise.
4. Open **API Products** — the business-friendly interface should show with no
   YAML or raw Kubernetes terminology.

## Common first-time issues

| Symptom | Cause | Fix |
|---|---|---|
| "Failed to get a valid plugin manifest" | Pod serving HTTP instead of HTTPS on 9001 | Use the Deployment above — it includes the `serving-cert` TLS mount |
| `CrashLoopBackOff` with `tls: no such file or directory` | service-CA hasn't materialized the Secret yet | Wait ~30s; if it persists, check the Service annotation matches the volume `secretName` |
| Pod runs but plugin not in nav | Plugin not registered in `console.operator.openshift.io/cluster` | Re-run step 4, then `oc -n openshift-console rollout restart deploy/console` |
| "Open in Grafana" disabled | Default route `rhcl-grafana/rhcl-grafana-route` not found | Install the Grafana automation or set the ConfigMap in [configuration.md](configuration.md) |

## Removing the plugin

```bash
# Remove the plugin from the console operator
oc get console.operator.openshift.io cluster -o json \
  | jq '.spec.plugins = [.spec.plugins[] | select(. != "custom-rhcl-console")]' \
  | oc apply -f -

oc delete consoleplugin custom-rhcl-console

# Delete the workload + Service (service-CA cleans the cert Secret automatically)
oc delete deployment,service,configmap \
  -n custom-rhcl-console -l app=custom-rhcl-console
oc delete configmap custom-rhcl-console-config -n custom-rhcl-console --ignore-not-found
oc delete project custom-rhcl-console
```

API-key Secrets in your application namespaces are owned by your app, not the
plugin — leave them in place when removing only the plugin.

## RBAC requirements

The plugin carries **no service-account token** (NFR-001). Every API call uses
the signed-in user's bearer token via the Console's built-in proxy, so users
see only what their cluster RBAC allows.

| Persona | Minimum RBAC |
|---|---|
| Platform SRE | `cluster-admin`, or namespace-scoped admin across gateway/app namespaces |
| App team operator | `view`/`edit` on their app namespace + `get` on the gateway namespace |
| API product owner | `view` on app namespaces |
| PoC reviewer | `view` cluster-wide |

Additionally, **any signed-in user** needs these reads to resolve deep links
and runtime config (they default to `system:authenticated` on a stock cluster;
grant explicitly only on clusters with restrictive default RBAC):

| Resource | Verb | Why |
|---|---|---|
| `routes` in `rhcl-grafana` (or override ns) | `get`, `watch` | "Open in Grafana" URL |
| `routes` in `tempo` (or override ns) | `get`, `watch` | "View trace" URL |
| `tempostacks` in `tempo` | `get`, `watch` | Tempo gateway tenant name |
| `configmaps` (`custom-rhcl-console-config`) | `get`, `watch` | Runtime configuration overrides |
