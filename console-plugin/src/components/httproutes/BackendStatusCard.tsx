import * as React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Label,
  Flex,
  FlexItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Divider,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { ResolvedBackend } from '../../types/backends';
import { RouteSyntheticProbe } from './RouteSyntheticProbe';

interface BackendStatusCardProps {
  backend: ResolvedBackend;
  routeUid: string | undefined;
  routeHostname: string;
  defaultPath: string;
}

/**
 * Single-backendRef view. Three rows of detail (resolution / readiness /
 * pods) and a probe widget at the bottom. Color of the title label
 * reflects an at-a-glance read of "is this backend healthy" combining
 * `ResolvedRefs` + ready endpoint count.
 */
export const BackendStatusCard: React.FC<BackendStatusCardProps> = ({
  backend, routeUid, routeHostname, defaultPath,
}) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');

  // At-a-glance health: resolved AND at least one ready endpoint.
  // Yellow when resolved but ZERO ready. Red when not resolved or service missing.
  const status: 'ok' | 'warn' | 'bad' =
    !backend.serviceFound || backend.resolvedRefs === false ? 'bad'
    : backend.totalEndpoints > 0 && backend.readyEndpoints === 0 ? 'bad'
    : backend.totalEndpoints === 0 ? 'warn'
    : 'ok';

  const statusColor: 'green' | 'orange' | 'red' =
    status === 'ok' ? 'green' : status === 'warn' ? 'orange' : 'red';
  const statusText: string =
    status === 'ok' ? t('Healthy')
    : status === 'warn' ? t('No endpoints')
    : t('Unhealthy');

  // Endpoints summary: "2/2" or "0/3" so the gap between ready and total is visible.
  const epSummary = `${backend.readyEndpoints}/${backend.totalEndpoints}`;

  // Detect HTTPS Service ports (appProtocol or port name) so the probe
  // can prepend the right scheme on the Service-proxy URL.
  const portObj = backend.service?.spec?.ports?.find((p) => p.port === backend.port);
  const isHttps = portObj?.appProtocol === 'https' || portObj?.name === 'https';

  return (
    <Card>
      <CardTitle>
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <span style={{ fontFamily: 'monospace' }}>{backend.namespace}/{backend.name}</span>
          </FlexItem>
          <FlexItem>
            <Label color={statusColor}>{statusText}</Label>
          </FlexItem>
          <FlexItem>
            <Label color="blue" isCompact>{`port ${backend.port ?? '?'}`}</Label>
          </FlexItem>
          {backend.weight !== 1 && (
            <FlexItem>
              <Label color="grey" isCompact>{`weight ${backend.weight}`}</Label>
            </FlexItem>
          )}
        </Flex>
      </CardTitle>
      <CardBody>
        <DescriptionList isHorizontal isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('K8s resolution')}</DescriptionListTerm>
            <DescriptionListDescription>
              {backend.resolvedRefs === null ? (
                <Label color="grey" isCompact>{t('No status yet')}</Label>
              ) : backend.resolvedRefs ? (
                <Label color="green" isCompact>{t('Resolved')}</Label>
              ) : (
                <Label color="red" isCompact>{t('Unresolved')}</Label>
              )}{' '}
              <small style={{ color: 'var(--pf-t--global--color--nonstatus--gray--default)' }}>
                {backend.serviceFound
                  ? t('(Service found via live watch)')
                  : t('(Service NOT found via live watch)')}
              </small>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Ready endpoints')}</DescriptionListTerm>
            <DescriptionListDescription>
              <span style={{ fontFamily: 'monospace' }}>{epSummary}</span>{' '}
              {backend.totalEndpoints > 0 && backend.readyEndpoints === 0 && (
                <Label color="red" isCompact>{t('All pods Not Ready')}</Label>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          {backend.podNames.length > 0 && (
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Pods')}</DescriptionListTerm>
              <DescriptionListDescription>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {backend.podNames.map((p) => (
                    <Label key={p} isCompact variant="outline" style={{ fontFamily: 'monospace' }}>
                      {p}
                    </Label>
                  ))}
                </div>
              </DescriptionListDescription>
            </DescriptionListGroup>
          )}
        </DescriptionList>

        <Divider style={{ marginTop: 12, marginBottom: 12 }} />

        <RouteSyntheticProbe
          routeUid={routeUid}
          routeHostname={routeHostname}
          backendNamespace={backend.namespace}
          backendName={backend.name}
          backendPort={backend.port ?? 80}
          defaultPath={defaultPath}
          httpsBackend={isHttps}
        />
      </CardBody>
    </Card>
  );
};
