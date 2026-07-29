import * as React from 'react';
// Cluster 4.21 host wraps plugin pages in `<CompatRouter>` from
// `react-router-dom-v5-compat`, which populates the router-**v6** context
// for path params. v5's `useParams` reads the v5 context and returns `{}`
// in that setup — that's what made the breadcrumb show `Gateways > /`
// (empty ns/name). Use `useParams` from `react-router-dom-v5-compat`, which
// reads the v6 context that CompatRouter actually fills. `Link` keeps coming
// from v5 `react-router-dom` (renders a plain <a>, both contexts handle it).
import { useParams } from 'react-router-dom-v5-compat';
import { Link } from 'react-router-dom';
import {
  PageSection,
  Title,
  Spinner,
  Bullseye,
  Breadcrumb,
  BreadcrumbItem,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  MenuToggleElement,
  Divider,
} from '@patternfly/react-core';
import { CubeIcon, ChartLineIcon, BellIcon, ExternalLinkAltIcon } from '@patternfly/react-icons';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { GatewayGVK, GatewayClassGVK } from '../../models';
import { Gateway, GatewayClass } from '../../types';
import StatusLabel from '../common/StatusLabel';
import ResourceActionsMenu from '../common/ResourceActionsMenu';
import { useGrafanaLink, GrafanaDashboard, GrafanaLink } from '../../utils/grafana';
import { useTempoLink } from '../../utils/tempo';
import GatewayOpsDashboard from './GatewayOpsDashboard';
import '../../styles/plugin-glass.css';

function relativeAge(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const MetaChip: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <span style={{ fontSize: 12, color: 'var(--pf-t--global--text--color--subtle)' }}>
    {label}:{' '}
    <span style={{ color: 'var(--pf-t--global--text--color--regular)', fontWeight: 600 }}>{value}</span>
  </span>
);

/**
 * Consolidated "Observability ▾" menu — folds the gateway's Grafana + Tempo
 * deep-links (previously two standalone buttons) into one secondary dropdown.
 * Each Grafana dashboard and the trace explorer render disabled when the
 * backing stack isn't installed (the hooks return `available: false`).
 */
const ObservabilityMenu: React.FC<{ gatewayVar: string }> = ({ gatewayVar }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const [open, setOpen] = React.useState(false);

  const dashboards: { key: GrafanaDashboard; label: string; link: GrafanaLink }[] = [
    { key: 'api-overview', label: t('Gateway traffic dashboard'), link: useGrafanaLink('api-overview', { gateway: gatewayVar }) },
    { key: 'api-consumers', label: t('Consumer dashboard'), link: useGrafanaLink('api-consumers') },
    { key: 'authorino', label: t('Authorino'), link: useGrafanaLink('authorino') },
    { key: 'limitador', label: t('Limitador'), link: useGrafanaLink('limitador') },
    { key: 'api-costs', label: t('Costs'), link: useGrafanaLink('api-costs') },
  ];
  const traces = useTempoLink({ serviceName: 'rhcl-gateway', lookback: '1h' });

  return (
    <Dropdown
      isOpen={open}
      onSelect={() => setOpen(false)}
      onOpenChange={(o) => setOpen(o)}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="secondary"
          icon={<ChartLineIcon />}
          isExpanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t('Observability')}
        </MenuToggle>
      )}
    >
      <DropdownList>
        {dashboards.map((d) =>
          d.link.available ? (
            <DropdownItem
              key={d.key}
              icon={<ExternalLinkAltIcon />}
              component="a"
              href={d.link.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {d.label}
            </DropdownItem>
          ) : (
            <DropdownItem key={d.key} isDisabled isAriaDisabled icon={<ExternalLinkAltIcon />}>
              {d.label} — {t('unavailable')}
            </DropdownItem>
          ),
        )}
        <Divider component="li" key="obs-div" />
        {traces.available ? (
          <DropdownItem
            key="traces"
            icon={<ChartLineIcon />}
            component={(props) => <Link {...props} to={traces.url ?? '#'} />}
          >
            {t('Trace explorer')}
          </DropdownItem>
        ) : (
          <DropdownItem key="traces" isDisabled isAriaDisabled icon={<ChartLineIcon />}>
            {t('Trace explorer')} — {t('unavailable')}
          </DropdownItem>
        )}
        <DropdownItem key="alerts" icon={<BellIcon />} component={(props) => <Link {...props} to="/monitoring/alerts" />}>
          {t('Alerts')}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};

const GatewayDetailPage: React.FC = () => {
  const { ns, name } = useParams<{ ns: string; name: string }>();
  const { t } = useTranslation('plugin__custom-rhcl-console');

  // List-then-find (single-resource watch returns undefined indefinitely on
  // cluster 4.21 / SDK 4.21 — same failure mode APIOverviewPage hit).
  const [gateways, loaded] = useK8sWatchResource<Gateway[]>({
    groupVersionKind: GatewayGVK,
    isList: true,
    namespace: ns,
  });
  const gateway = React.useMemo(
    () => (gateways || []).find((g) => g.metadata?.name === name),
    [gateways, name],
  );

  // GatewayClass carries the controllerName — list + find (cluster-scoped).
  const [gatewayClasses] = useK8sWatchResource<GatewayClass[]>({
    groupVersionKind: GatewayClassGVK,
    isList: true,
  });
  const controllerName = React.useMemo(
    () =>
      (gatewayClasses || []).find((gc) => gc.metadata?.name === gateway?.spec?.gatewayClassName)?.spec
        ?.controllerName,
    [gatewayClasses, gateway],
  );

  if (!loaded || !gateway) {
    return (
      <div className="rhcl-plugin-root">
        <PageSection isFilled>
          <Bullseye>
            <Spinner size="xl" />
          </Bullseye>
        </PageSection>
      </div>
    );
  }

  const gwClass = gateway.spec?.gatewayClassName;
  const grafanaGwVar = gwClass ? `${name}-${gwClass}` : `${name}-.*`;

  return (
    <div className="rhcl-plugin-root">
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/connectivity-link/gateways">{t('Gateways')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>
            {ns}/{name}
          </BreadcrumbItem>
        </Breadcrumb>

        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Title headingLevel="h1">
            {name} <StatusLabel conditions={gateway.status?.conditions} />
          </Title>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ObservabilityMenu gatewayVar={grafanaGwVar} />
            <ResourceActionsMenu
              gvk={{ group: 'gateway.networking.k8s.io', version: 'v1', kind: 'Gateway' }}
              namespace={ns || ''}
              name={name || ''}
              listHref="/connectivity-link/gateways"
              resource={gateway}
              plural="gateways"
              topItems={
                <DropdownItem
                  key="gateway-pods"
                  icon={<CubeIcon />}
                  component={(props) => (
                    <Link
                      {...props}
                      to={`/search/ns/${ns}?kind=Pod&q=gateway.networking.k8s.io%2Fgateway-name%3D${encodeURIComponent(name || '')}`}
                    />
                  )}
                >
                  {t('Gateway pods')}
                </DropdownItem>
              }
            />
          </div>
        </div>

        {/* Meta chip row — the identity band from the mockup header. */}
        <div style={{ marginTop: 10, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <MetaChip label={t('Namespace')} value={ns} />
          <MetaChip label={t('Gateway class')} value={gwClass || '—'} />
          <MetaChip label={t('Controller')} value={controllerName || '—'} />
          <MetaChip label={t('API')} value={`${GatewayGVK.group}/${GatewayGVK.version}`} />
          <MetaChip label={t('Age')} value={relativeAge(gateway.metadata?.creationTimestamp)} />
        </div>
      </PageSection>

      <PageSection>
        <GatewayOpsDashboard gateway={gateway} name={name || ''} namespace={ns || ''} />
      </PageSection>
    </div>
  );
};

export default GatewayDetailPage;
