import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Grid,
  GridItem,
  Label,
  Button,
  Flex,
  FlexItem,
  Icon,
  Alert,
  Spinner,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  Tooltip,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import {
  ExternalLinkAltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  CogIcon,
} from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { useK8sWatchResource, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  usePluginConfig,
  parseCostPricing,
  CostPricing,
  PluginConfig,
} from '../../utils/pluginConfig';
import { useGrafanaLink } from '../../utils/grafana';
import '../../styles/plugin-glass.css';

/**
 * Settings — read-only view of every integration wired into the plugin.
 *
 * The plugin loads its runtime settings from the ConfigMap
 * `custom-rhcl-console-config` (namespace `custom-rhcl-console`). Ansible
 * (`developer_hub` + related roles) reconciles this ConfigMap on every
 * `apps-install` run, so an inline edit here would be overwritten. That's
 * why V1 is read-only + a "Edit ConfigMap" link that opens the native
 * Console editor — power users who want to persist a change should update
 * the Ansible group_vars instead.
 *
 * Sections mirror the config surface:
 *   - Prometheus       (in-cluster, via Console proxy — informational only)
 *   - Grafana          (namespace / route / dashboard prefix)
 *   - Tempo            (namespace / gateway route / stack name)
 *   - Developer Hub    (RHDH URL, opt-in)
 *   - Developer Portal (external portal URL, opt-in)
 *   - DNS Prober       (companion service URL, with reachability check)
 *   - Cost pricing     (currency / budget / per-tier rate table)
 */
const CONFIGMAP_NAMESPACE = 'custom-rhcl-console';
const CONFIGMAP_NAME = 'custom-rhcl-console-config';
const CONFIGMAP_EDIT_URL = `/k8s/ns/${CONFIGMAP_NAMESPACE}/configmaps/${CONFIGMAP_NAME}/yaml`;

const SettingsPage: React.FC = () => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const { config, loaded } = usePluginConfig();

  const [cm, cmLoaded, cmError] = useK8sWatchResource<K8sResourceCommon>({
    groupVersionKind: { version: 'v1', kind: 'ConfigMap' },
    namespace: CONFIGMAP_NAMESPACE,
    name: CONFIGMAP_NAME,
    isList: false,
  });
  const cmExists = cmLoaded && !cmError && !!cm?.metadata?.name;

  if (!loaded) {
    return (
      <div className="rhcl-plugin-root">
        <PageSection isFilled>
          <Bullseye><Spinner size="xl" /></Bullseye>
        </PageSection>
      </div>
    );
  }

  return (
    <div className="rhcl-plugin-root">
      <PageSection variant="default">
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
          <FlexItem>
            <Icon size="lg"><CogIcon /></Icon>
          </FlexItem>
          <FlexItem>
            <Title headingLevel="h1">{t('Settings')}</Title>
          </FlexItem>
        </Flex>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--pf-v5-global--Color--200)' }}>
          {t(
            'Runtime configuration for the Connectivity Link plugin. All values come from the ConfigMap {{cm}} in namespace {{ns}}.',
            { cm: CONFIGMAP_NAME, ns: CONFIGMAP_NAMESPACE },
          )}
        </div>
      </PageSection>

      <PageSection>
        <Alert
          isInline
          variant={cmExists ? 'info' : 'warning'}
          title={cmExists ? t('Read-only view') : t('ConfigMap not found')}
          actionLinks={
            cmExists ? (
              <Button
                variant="link"
                component="a"
                href={CONFIGMAP_EDIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                icon={<ExternalLinkAltIcon />}
                iconPosition="end"
                isInline
              >
                {t('Edit ConfigMap in OpenShift Console')}
              </Button>
            ) : undefined
          }
        >
          {cmExists
            ? t(
                'The plugin ConfigMap is typically reconciled by Ansible on the next apps-install run. To persist a change, update the group_vars in the automation repo — inline edits here will be overwritten.',
              )
            : t(
                'The ConfigMap {{cm}} does not exist in namespace {{ns}}. Every field below is falling back to its built-in default. Run the apps-install playbook (or apply the ConfigMap manually) to enable overrides.',
                { cm: CONFIGMAP_NAME, ns: CONFIGMAP_NAMESPACE },
              )}
        </Alert>

        <Grid hasGutter style={{ marginTop: 16 }}>
          <GridItem md={6} span={12}>
            <PrometheusCard />
          </GridItem>
          <GridItem md={6} span={12}>
            <GrafanaCard config={config} />
          </GridItem>
          <GridItem md={6} span={12}>
            <TempoCard config={config} />
          </GridItem>
          <GridItem md={6} span={12}>
            <DnsProberCard config={config} />
          </GridItem>
          <GridItem md={6} span={12}>
            <DeveloperHubCard config={config} />
          </GridItem>
          <GridItem md={6} span={12}>
            <DeveloperPortalCard config={config} />
          </GridItem>
          <GridItem span={12}>
            <CostPricingCard config={config} />
          </GridItem>
          <GridItem span={12}>
            <RawConfigCard config={config} cmExists={cmExists} />
          </GridItem>
        </Grid>
      </PageSection>
    </div>
  );
};

/* ---------------------------------------------------------------- */
/* Section cards                                                     */
/* ---------------------------------------------------------------- */

const PrometheusCard: React.FC = () => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  return (
    <SectionCard title={t('Prometheus')} statusPill={<PresenceLabel state="static" label={t('Built-in')} />}>
      <DescriptionList isCompact isHorizontal>
        <Row term={t('Endpoint')} value={<code>/api/prometheus</code>} />
        <Row term={t('Source')} value={t('OpenShift Console proxy (in-cluster monitoring stack)')} />
        <Row
          term={t('Custom metrics')}
          value={t('Requires User Workload Monitoring to scrape Istio + Kuadrant targets')}
        />
      </DescriptionList>
      <Note>
        {t(
          'The plugin does not talk to Prometheus directly — every query is issued via the built-in Console proxy. There is no configurable endpoint.',
        )}
      </Note>
    </SectionCard>
  );
};

const GrafanaCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  // Ping the same "api-overview" dashboard the OpenInGrafanaButton uses
  // to detect whether the configured Grafana route actually resolves.
  const { available } = useGrafanaLink('api-overview', {});
  return (
    <SectionCard
      title={t('Grafana')}
      statusPill={
        available
          ? <PresenceLabel state="ok" label={t('Reachable')} />
          : <PresenceLabel state="missing" label={t('Route not found')} />
      }
    >
      <DescriptionList isCompact isHorizontal>
        <Row term={t('Namespace')} value={valueOrDefault(config.grafanaNamespace, 'monitoring')} />
        <Row term={t('Route')} value={valueOrDefault(config.grafanaRouteName, 'grafana')} />
        <Row
          term={t('Dashboard UID prefix')}
          value={valueOrDefault(config.grafanaDashboardPrefix, 'rhcl-')}
        />
      </DescriptionList>
      <Note>
        {t(
          'When the route above does not exist, every "Open in Grafana" button in the plugin renders as disabled.',
        )}
      </Note>
    </SectionCard>
  );
};

const TempoCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  return (
    <SectionCard title={t('Tempo (Traces)')} statusPill={<PresenceLabel state="static" label={t('Optional')} />}>
      <DescriptionList isCompact isHorizontal>
        <Row term={t('Namespace')} value={valueOrDefault(config.tempoNamespace, 'tempo')} />
        <Row
          term={t('Gateway route')}
          value={valueOrDefault(config.tempoGatewayRouteName, 'tempo-tempo-rhcl-gateway')}
        />
        <Row term={t('Stack name')} value={valueOrDefault(config.tempoStackName, 'tempo-rhcl')} />
      </DescriptionList>
      <Note>
        {t(
          'Drives the "View traces" deep links on Gateway and HTTPRoute detail pages. When the gateway route does not exist, the buttons stay visible but disabled.',
        )}
      </Note>
    </SectionCard>
  );
};

const DnsProberCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const configured = !!config.dnsProberUrl?.trim();
  // Live health check via the ConsolePlugin proxy alias (same path every
  // prober-consuming hook uses). Any non-200 = "installed but unhealthy".
  const [ok, setOk] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (!configured) {
      setOk(null);
      return;
    }
    let cancelled = false;
    fetch('/api/proxy/plugin/custom-rhcl-console/dns-prober/q/health', {
      credentials: 'include',
    })
      .then((r) => (cancelled ? undefined : setOk(r.ok)))
      .catch(() => (cancelled ? undefined : setOk(false)));
    return () => {
      cancelled = true;
    };
  }, [configured]);
  return (
    <SectionCard
      title={t('DNS Prober companion')}
      statusPill={
        !configured ? (
          <PresenceLabel state="missing" label={t('Not configured')} />
        ) : ok === null ? (
          <PresenceLabel state="static" label={t('Checking…')} />
        ) : ok ? (
          <PresenceLabel state="ok" label={t('Healthy')} />
        ) : (
          <PresenceLabel state="warning" label={t('Unreachable')} />
        )
      }
    >
      <DescriptionList isCompact isHorizontal>
        <Row term={t('External URL')} value={valueOrEmpty(config.dnsProberUrl)} />
        <Row
          term={t('Console proxy alias')}
          value={<code>/api/proxy/plugin/custom-rhcl-console/dns-prober</code>}
        />
        <Row term={t('Endpoints')} value={
          <>
            <code>/api/dns/probe</code>, <code>/api/tls/probe</code>, <code>/api/headers/probe</code>
          </>
        } />
      </DescriptionList>
      <Note>
        {t(
          'Small Quarkus companion. When absent, live cross-resolver DNS, HTTPS handshake and security-headers probes fall back to install callouts.',
        )}
      </Note>
    </SectionCard>
  );
};

const DeveloperHubCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const configured = !!config.internalDeveloperHubUrl?.trim();
  return (
    <SectionCard
      title={t('Internal Developer Hub')}
      statusPill={
        configured
          ? <PresenceLabel state="ok" label={t('Enabled')} />
          : <PresenceLabel state="missing" label={t('Not configured')} />
      }
    >
      <DescriptionList isCompact isHorizontal>
        <Row
          term={t('URL')}
          value={
            configured ? (
              <a href={config.internalDeveloperHubUrl} target="_blank" rel="noopener noreferrer">
                {config.internalDeveloperHubUrl} <ExternalLinkAltIcon />
              </a>
            ) : (
              valueOrEmpty(config.internalDeveloperHubUrl)
            )
          }
        />
      </DescriptionList>
      <Note>
        {t(
          'When set, an "Internal Developer Hub" sidebar item links to the customer\'s RHDH / Backstage instance.',
        )}
      </Note>
    </SectionCard>
  );
};

const DeveloperPortalCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const configured = !!config.developerPortalUrl?.trim();
  return (
    <SectionCard
      title={t('Developer Portal')}
      statusPill={
        configured
          ? <PresenceLabel state="ok" label={t('Enabled')} />
          : <PresenceLabel state="missing" label={t('Not configured')} />
      }
    >
      <DescriptionList isCompact isHorizontal>
        <Row
          term={t('URL')}
          value={
            configured ? (
              <a href={config.developerPortalUrl} target="_blank" rel="noopener noreferrer">
                {config.developerPortalUrl} <ExternalLinkAltIcon />
              </a>
            ) : (
              valueOrEmpty(config.developerPortalUrl)
            )
          }
        />
      </DescriptionList>
      <Note>
        {t(
          'When set, a "Developer Portal" sidebar item redirects to the customer\'s standalone portal.',
        )}
      </Note>
    </SectionCard>
  );
};

const CostPricingCard: React.FC<{ config: PluginConfig }> = ({ config }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const pricing: CostPricing = React.useMemo(
    () => parseCostPricing(config.costPricing),
    [config.costPricing],
  );
  const tiers = Object.entries(pricing);
  const budget = config.costBudget ? String(config.costBudget) : '';
  const currency = config.costCurrency || 'BRL';

  return (
    <SectionCard
      title={t('Cost pricing')}
      statusPill={
        tiers.length > 0
          ? <PresenceLabel state="ok" label={t('{{n}} tier(s)', { n: tiers.length })} />
          : <PresenceLabel state="missing" label={t('Not configured')} />
      }
    >
      <DescriptionList isCompact isHorizontal>
        <Row term={t('Currency')} value={currency} />
        <Row
          term={t('Monthly budget')}
          value={budget ? `${currency} ${budget}` : t('Not set')}
        />
      </DescriptionList>
      {tiers.length === 0 ? (
        <EmptyState variant="sm" titleText={t('No pricing tiers configured')} headingLevel="h4">
          <EmptyStateBody>
            {t(
              'Set costPricing in the ConfigMap to a JSON record like {"gold":{"tokens_per_1k":0.10,"calls_per_1k":0.05}}. The Cost Monitoring page shows raw usage only until this is populated.',
            )}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <Table aria-label={t('Cost pricing tiers')} variant="compact" style={{ marginTop: 12 }}>
          <Thead>
            <Tr>
              <Th>{t('Tier')}</Th>
              <Th>{t('Per 1K tokens')}</Th>
              <Th>{t('Per 1K calls')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {tiers
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([tier, values]) => (
                <Tr key={tier}>
                  <Td>
                    <Label color={tierColor(tier)} isCompact>
                      {tier}
                    </Label>
                  </Td>
                  <Td>{currency} {values.tokens_per_1k.toFixed(4)}</Td>
                  <Td>{currency} {values.calls_per_1k.toFixed(4)}</Td>
                </Tr>
              ))}
          </Tbody>
        </Table>
      )}
      <Note>
        {t(
          'Tier keys are matched case-insensitively against the secret.kuadrant.io/plan-id annotation on APIKey Secrets. Unknown tiers fall back to "anonymous" if present, otherwise pricing is treated as zero.',
        )}
      </Note>
    </SectionCard>
  );
};

const RawConfigCard: React.FC<{ config: PluginConfig; cmExists: boolean }> = ({
  config,
  cmExists,
}) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  return (
    <Card>
      <CardTitle>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>{t('ConfigMap contents')}</FlexItem>
          {cmExists && (
            <FlexItem>
              <Button
                variant="secondary"
                component="a"
                href={CONFIGMAP_EDIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                icon={<ExternalLinkAltIcon />}
                iconPosition="end"
              >
                {t('Open in OpenShift Console')}
              </Button>
            </FlexItem>
          )}
        </Flex>
      </CardTitle>
      <CardBody>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>
            {t('Show raw key/value pairs')}
          </summary>
          <Table aria-label={t('ConfigMap contents')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('Key')}</Th>
                <Th>{t('Value')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {Object.entries(config as Record<string, unknown>).length === 0 ? (
                <Tr>
                  <Td colSpan={2}>{t('No overrides — every field falls back to its built-in default.')}</Td>
                </Tr>
              ) : (
                Object.entries(config as Record<string, unknown>)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <Tr key={k}>
                      <Td><code>{k}</code></Td>
                      <Td>
                        <code style={{ wordBreak: 'break-all' }}>{String(v)}</code>
                      </Td>
                    </Tr>
                  ))
              )}
            </Tbody>
          </Table>
        </details>
      </CardBody>
    </Card>
  );
};

/* ---------------------------------------------------------------- */
/* Atoms                                                              */
/* ---------------------------------------------------------------- */

const SectionCard: React.FC<{
  title: string;
  statusPill?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, statusPill, children }) => (
  <Card isFullHeight>
    <CardTitle>
      <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        <FlexItem>{title}</FlexItem>
        {statusPill && <FlexItem>{statusPill}</FlexItem>}
      </Flex>
    </CardTitle>
    <CardBody>{children}</CardBody>
  </Card>
);

const Row: React.FC<{ term: string; value: React.ReactNode }> = ({ term, value }) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{term}</DescriptionListTerm>
    <DescriptionListDescription>{value}</DescriptionListDescription>
  </DescriptionListGroup>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, color: 'var(--pf-v5-global--Color--200)', marginTop: 12 }}>
    {children}
  </div>
);

type PresenceState = 'ok' | 'warning' | 'missing' | 'static';

const PresenceLabel: React.FC<{ state: PresenceState; label: string }> = ({ state, label }) => {
  const color: 'green' | 'orange' | 'grey' | 'blue' =
    state === 'ok' ? 'green' : state === 'warning' ? 'orange' : state === 'missing' ? 'grey' : 'blue';
  const icon =
    state === 'ok' ? (
      <Icon status="success"><CheckCircleIcon /></Icon>
    ) : state === 'warning' ? (
      <Icon status="warning"><ExclamationTriangleIcon /></Icon>
    ) : state === 'missing' ? (
      <Icon><MinusCircleIcon /></Icon>
    ) : undefined;
  return (
    <Tooltip content={label}>
      <Label color={color} icon={icon}>
        {label}
      </Label>
    </Tooltip>
  );
};

const tierColor = (tier: string): 'yellow' | 'grey' | 'orange' | 'blue' | 'red' => {
  const t = tier.toLowerCase();
  if (t === 'gold') return 'yellow';
  if (t === 'silver') return 'grey';
  if (t === 'bronze') return 'orange';
  if (t === 'anonymous') return 'blue';
  return 'red';
};

const valueOrDefault = (v: string | undefined, dflt: string): React.ReactNode => {
  const set = !!v && v.trim().length > 0;
  return set ? <code>{v}</code> : (
    <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>
      <code>{dflt}</code> (default)
    </span>
  );
};

const valueOrEmpty = (v: string | undefined): React.ReactNode => {
  if (v && v.trim()) return <code>{v}</code>;
  return <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>—</span>;
};

// Silence the "declared but never used" warning for the Link import — it's
// kept for parity with sibling pages that link back into the plugin.
void Link;

export default SettingsPage;
