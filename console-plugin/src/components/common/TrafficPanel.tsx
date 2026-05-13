import * as React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Spinner,
  EmptyState,
  EmptyStateBody,
  Split,
  SplitItem,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { ExclamationTriangleIcon, SearchIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { usePrometheusTraffic, TrafficData } from '../../hooks/usePrometheusTraffic';
import { TrafficCharts } from './TrafficChart';

interface TrafficPanelProps {
  kind: 'Gateway' | 'HTTPRoute';
  name: string;
  namespace: string;
  pollInterval?: number;
  gatewayClass?: string;
  backendServices?: string[];
  metricsNamespaces?: string[];
}

function hasAnyData(data: TrafficData): boolean {
  return Object.values(data).some((v) => v !== null);
}

const TrafficPanel: React.FC<TrafficPanelProps> = ({ kind, name, namespace, pollInterval, gatewayClass, backendServices, metricsNamespaces }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const { data, loaded, metricsAvailable } = usePrometheusTraffic(
    kind,
    name,
    namespace,
    pollInterval,
    gatewayClass,
    backendServices,
    metricsNamespaces,
  );

  if (!loaded) {
    return (
      <Card>
        <CardTitle>{t('Metrics')}</CardTitle>
        <CardBody>
          <Spinner size="lg" />
        </CardBody>
      </Card>
    );
  }

  if (!metricsAvailable) {
    return (
      <Card>
        <CardTitle>{t('Metrics')}</CardTitle>
        <CardBody>
          <EmptyState
            variant="sm"
            icon={ExclamationTriangleIcon}
            titleText={t('Metrics unavailable')}
            headingLevel="h3"
          >
            <EmptyStateBody>
              {t(
                'Metrics are unavailable. User workload monitoring may not be enabled on this cluster.',
              )}
            </EmptyStateBody>
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  if (!hasAnyData(data)) {
    return (
      <Stack hasGutter>
        <StackItem>
          <Card>
            <CardTitle>{t('Metrics')}</CardTitle>
            <CardBody>
              <EmptyState
                variant="sm"
                icon={SearchIcon}
                titleText={t('No traffic data')}
                headingLevel="h3"
              >
                <EmptyStateBody>
                  {t(
                    'No traffic has been recorded for this resource. Metrics will appear once traffic is flowing.',
                  )}
                </EmptyStateBody>
              </EmptyState>
            </CardBody>
          </Card>
        </StackItem>
        <StackItem>
          <TrafficCharts kind={kind} name={name} namespace={namespace} gatewayClass={gatewayClass} backendServices={backendServices} metricsNamespaces={metricsNamespaces} />
        </StackItem>
      </Stack>
    );
  }

  const fmt = (val: number | null, suffix = '') =>
    val !== null ? `${val.toFixed(2)}${suffix}` : '-';

  return (
    <Stack hasGutter>
      <StackItem>
        <Card>
          <CardTitle>{t('Metrics')}</CardTitle>
          <CardBody>
            <Split hasGutter>
              <SplitItem>
                <DescriptionList isHorizontal isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Requests/sec')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {t('1m rate')}: {fmt(data.requestRate1m)} | {t('5m rate')}: {fmt(data.requestRate5m)}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Success rate')}</DescriptionListTerm>
                    <DescriptionListDescription>{fmt(data.successRate, '%')}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>2xx / 4xx / 5xx</DescriptionListTerm>
                    <DescriptionListDescription>
                      {fmt(data.rate2xx)} / {fmt(data.rate4xx)} / {fmt(data.rate5xx)}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </SplitItem>
              <SplitItem>
                <DescriptionList isHorizontal isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Latency')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {t('p50')}: {fmt(data.latencyP50, 'ms')} | {t('p95')}: {fmt(data.latencyP95, 'ms')} | {t('p99')}: {fmt(data.latencyP99, 'ms')}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </SplitItem>
            </Split>
          </CardBody>
        </Card>
      </StackItem>
      <StackItem>
        <TrafficCharts kind={kind} name={name} namespace={namespace} gatewayClass={gatewayClass} backendServices={backendServices} metricsNamespaces={metricsNamespaces} />
      </StackItem>
    </Stack>
  );
};

export default TrafficPanel;
