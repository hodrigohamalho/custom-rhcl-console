import * as React from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom-v5-compat';
import {
  PageSection,
  Title,
  Spinner,
  Bullseye,
  EmptyState,
  EmptyStateBody,
  Grid,
  GridItem,
  Card,
  CardTitle,
  CardBody,
  Label,
  LabelGroup,
  Flex,
  FlexItem,
  Breadcrumb,
  BreadcrumbItem,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { MCPServerRegistrationGVK } from '../../models';
import { MCPServerRegistration, mcpPrefix, mcpReadiness } from '../../types';
import ResourceActionsMenu from '../common/ResourceActionsMenu';
import MCPPlayground from './MCPPlayground';
import '../../styles/plugin-glass.css';

/**
 * Detail view for one `MCPServerRegistration` (mcp.kuadrant.io/v1): the prefix
 * the broker publishes its tools under, the backend HTTPRoute, discovery hints,
 * and readiness. The list of *actual federated tools* is not carried on the CR
 * (the CRD status is conditions-only) — it comes from the broker's `tools/list`,
 * which the Phase 2 in-console playground will call.
 */
const MCPServerDetailPage: React.FC = () => {
  const { ns, name } = useParams<{ ns: string; name: string }>();
  const { t } = useTranslation('plugin__custom-rhcl-console');

  const [servers, loaded] = useK8sWatchResource<MCPServerRegistration[]>({
    groupVersionKind: MCPServerRegistrationGVK,
    isList: true,
  });
  const server = (servers || []).find(
    (s) => s.metadata?.name === name && s.metadata?.namespace === ns,
  );

  if (!loaded) {
    return (
      <div className="rhcl-plugin-root">
        <Bullseye>
          <Spinner />
        </Bullseye>
      </div>
    );
  }
  if (!server) {
    return (
      <div className="rhcl-plugin-root">
        <PageSection>
          <EmptyState headingLevel="h2" titleText={t('MCP server not found')}>
            <EmptyStateBody>
              {t('No MCPServerRegistration named {{name}} in namespace {{ns}}.', { name, ns })}
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </div>
    );
  }

  const prefix = mcpPrefix(server);
  const ready = mcpReadiness(server);
  const ref = server.spec?.targetRef;
  const routeNs = ref?.namespace || ns || '';
  const conditions = server.status?.conditions || [];
  const tags = server.spec?.tags || [];

  return (
    <div className="rhcl-plugin-root">
      <PageSection variant="default">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/connectivity-link/mcp-servers">{t('MCP Servers')}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{name}</BreadcrumbItem>
        </Breadcrumb>
        <Flex
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          alignItems={{ default: 'alignItemsCenter' }}
          style={{ marginTop: 12 }}
        >
          <FlexItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
              <FlexItem>
                <Title headingLevel="h1">{name}</Title>
              </FlexItem>
              <FlexItem>
                <Label color={ready.color}>{t(ready.label)}</Label>
              </FlexItem>
            </Flex>
          </FlexItem>
          <FlexItem>
            <ResourceActionsMenu
              gvk={MCPServerRegistrationGVK}
              namespace={ns || ''}
              name={name || ''}
              listHref="/connectivity-link/mcp-servers"
              resource={server}
              plural="mcpserverregistrations"
            />
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <Grid hasGutter>
          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>{t('Registration')}</CardTitle>
              <CardBody>
                <DescriptionList isHorizontal>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Namespace')}</DescriptionListTerm>
                    <DescriptionListDescription>{ns}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Tool prefix')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {prefix ? <code>{prefix}</code> : <Dim>{t('none')}</Dim>}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Path')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <code>{server.spec?.path || '/mcp'}</code>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('State')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label color={server.spec?.state === 'Disabled' ? 'grey' : 'blue'} isCompact>
                        {server.spec?.state || 'Enabled'}
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>{t('Backend route')}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {ref?.name ? (
                        (ref.kind || 'HTTPRoute') === 'HTTPRoute' ? (
                          <Link to={`/connectivity-link/httproutes/${routeNs}/${ref.name}`}>
                            {ref.name}
                          </Link>
                        ) : (
                          <>
                            {ref.kind}/{ref.name}
                          </>
                        )
                      ) : (
                        <Dim>—</Dim>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                  {server.spec?.hint && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>{t('Hint')}</DescriptionListTerm>
                      <DescriptionListDescription>{server.spec.hint}</DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                  {tags.length > 0 && (
                    <DescriptionListGroup>
                      <DescriptionListTerm>{t('Tags')}</DescriptionListTerm>
                      <DescriptionListDescription>
                        <LabelGroup>
                          {tags.map((tag) => (
                            <Label key={tag} isCompact color="purple">
                              {tag}
                            </Label>
                          ))}
                        </LabelGroup>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  )}
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>

          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>{t('Status')}</CardTitle>
              <CardBody>
                {conditions.length === 0 ? (
                  <Dim>{t('No conditions reported yet.')}</Dim>
                ) : (
                  <Table aria-label={t('Conditions')} variant="compact">
                    <Thead>
                      <Tr>
                        <Th>{t('Type')}</Th>
                        <Th>{t('Status')}</Th>
                        <Th>{t('Reason')}</Th>
                        <Th>{t('Message')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {conditions.map((c) => (
                        <Tr key={c.type}>
                          <Td>{c.type}</Td>
                          <Td>
                            <Label
                              isCompact
                              color={c.status === 'True' ? 'green' : c.status === 'False' ? 'red' : 'grey'}
                            >
                              {c.status}
                            </Label>
                          </Td>
                          <Td>{c.reason || <Dim>—</Dim>}</Td>
                          <Td>{c.message || <Dim>—</Dim>}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </GridItem>

          <GridItem span={12}>
            <Card>
              <CardTitle>
                {t('Federated tools')}
                {prefix && (
                  <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--pf-v5-global--Color--200)' }}>
                    <code>{prefix}…</code>
                  </span>
                )}
              </CardTitle>
              <CardBody>
                <MCPPlayground prefix={prefix} />
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </div>
  );
};

function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>{children}</span>;
}

export default MCPServerDetailPage;
