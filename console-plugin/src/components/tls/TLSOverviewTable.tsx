import * as React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Label,
  Tooltip,
  EmptyState,
  EmptyStateBody,
  Button,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td } from '@patternfly/react-table';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  OutlinedQuestionCircleIcon,
  ExternalLinkAltIcon,
  ArrowRightIcon,
  SearchIcon,
} from '@patternfly/react-icons';
import { Link } from 'react-router-dom';
import { STATUS_META } from '../dns/types';
import {
  TlsCertRow,
  CertHealthStatus,
  RenewalStatus,
  HandshakeStatus,
} from './useTlsOverview';

/**
 * Primary navigation surface of the TLS Overview. One row per
 * Certificate. Each row is a shortcut into TLS Troubleshooting (the
 * deep debugging page) plus two secondary quick-links.
 *
 * Toolbar sits inside the card so filters and search feel like part of
 * the table rather than orphaned above it. All filtering is client-
 * side — the whole cert list is already in memory from the watch, and
 * this way filter state is instant with no re-fetch.
 */

interface Props {
  rows: TlsCertRow[];
  filterOptions: {
    gateways: string[];
    issuers: string[];
    namespaces: string[];
  };
}

const STATUS_LABEL: Record<CertHealthStatus, string> = {
  healthy: 'Healthy',
  expiring: 'Expiring Soon',
  expired: 'Expired',
  error: 'Error',
};
const STATUS_COLOR: Record<CertHealthStatus, 'green' | 'orange' | 'red' | 'grey'> = {
  healthy: 'green',
  expiring: 'orange',
  expired: 'red',
  error: 'grey',
};
const STATUS_ICON: Record<CertHealthStatus, React.ReactNode> = {
  healthy: <CheckCircleIcon style={{ color: STATUS_META.healthy.color }} />,
  expiring: <ExclamationTriangleIcon style={{ color: STATUS_META.warning.color }} />,
  expired: <ExclamationCircleIcon style={{ color: STATUS_META.failing.color }} />,
  error: <OutlinedQuestionCircleIcon style={{ color: STATUS_META.unknown.color }} />,
};

const RENEWAL_META: Record<RenewalStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: STATUS_META.healthy.color },
  'not-scheduled': { label: 'Not Scheduled', color: STATUS_META.warning.color },
  failed: { label: 'Failed', color: STATUS_META.failing.color },
  unknown: { label: 'Unknown', color: STATUS_META.unknown.color },
};

const HANDSHAKE_META: Record<HandshakeStatus, { label: string; color: string }> = {
  ok: { label: 'OK', color: STATUS_META.healthy.color },
  failed: { label: 'Failed', color: STATUS_META.failing.color },
  unknown: { label: 'Unknown', color: STATUS_META.unknown.color },
};

const FilterSelect: React.FC<{
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}> = ({ label, value, options, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <Select
      aria-label={label}
      isOpen={isOpen}
      selected={value ?? '__all__'}
      onOpenChange={setIsOpen}
      onSelect={(_e, v) => {
        setIsOpen(false);
        onChange(v === '__all__' || v == null ? null : String(v));
      }}
      toggle={(ref: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={ref}
          onClick={() => setIsOpen((o) => !o)}
          isExpanded={isOpen}
          style={{ minWidth: 160 }}
        >
          <span style={{ color: 'var(--pf-v5-global--Color--200)', marginRight: 6 }}>
            {label}:
          </span>
          {value ?? 'All'}
        </MenuToggle>
      )}
    >
      <SelectList>
        <SelectOption value="__all__">
          <span style={{ fontStyle: 'italic' }}>All {label.toLowerCase()}s</span>
        </SelectOption>
        {options.map((o) => (
          <SelectOption key={o} value={o}>
            {o}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  );
};

const TLSOverviewTable: React.FC<Props> = ({ rows, filterOptions }) => {
  const [search, setSearch] = React.useState('');
  const [gateway, setGateway] = React.useState<string | null>(null);
  const [issuer, setIssuer] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [namespace, setNamespace] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay =
          `${r.hostname} ${r.certificateName} ${r.gatewayName || ''} ${r.issuerName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (gateway && r.gatewayName !== gateway) return false;
      if (issuer && r.issuerLabel !== issuer) return false;
      if (status && r.status !== status) return false;
      if (namespace && r.namespace !== namespace) return false;
      return true;
    });
  }, [rows, search, gateway, issuer, status, namespace]);

  const totalLabel = `${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ''}`;

  return (
    <Card aria-label="TLS certificates" className="rhcl-tls-overview-panel">
      <CardTitle>
        <span
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>TLS Certificates ({totalLabel})</span>
        </span>
      </CardTitle>
      <CardBody>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem style={{ minWidth: 260 }}>
              <SearchInput
                placeholder="Search hostnames, certificates, gateways…"
                value={search}
                onChange={(_e, v) => setSearch(v)}
                onClear={() => setSearch('')}
                aria-label="Search"
              />
            </ToolbarItem>
            <ToolbarItem>
              <FilterSelect
                label="Gateway"
                value={gateway}
                options={filterOptions.gateways}
                onChange={setGateway}
              />
            </ToolbarItem>
            <ToolbarItem>
              <FilterSelect
                label="Issuer"
                value={issuer}
                options={filterOptions.issuers}
                onChange={setIssuer}
              />
            </ToolbarItem>
            <ToolbarItem>
              <FilterSelect
                label="Status"
                value={status}
                options={['healthy', 'expiring', 'expired', 'error']}
                onChange={setStatus}
              />
            </ToolbarItem>
            <ToolbarItem>
              <FilterSelect
                label="Namespace"
                value={namespace}
                options={filterOptions.namespaces}
                onChange={setNamespace}
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState
            titleText={rows.length === 0 ? 'No TLS certificates detected' : 'Nothing matches your filters'}
            headingLevel="h4"
            icon={SearchIcon}
          >
            <EmptyStateBody>
              {rows.length === 0
                ? 'Create a TLSPolicy to publish certificates for a Gateway. Once cert-manager finishes issuing, they will show up here automatically.'
                : 'Clear a filter or the search query to see more rows.'}
            </EmptyStateBody>
            {rows.length === 0 && (
              <Button
                variant="primary"
                component={(props) => <Link {...props} to="/connectivity-link/policies/create/tlspolicy" />}
                style={{ marginTop: 12 }}
              >
                Create TLSPolicy
              </Button>
            )}
          </EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table aria-label="TLS certificates" variant="compact" borders={false}>
              <Thead>
                <Tr>
                  <Th>Hostname</Th>
                  <Th>Gateway</Th>
                  <Th>Certificate</Th>
                  <Th>Issuer</Th>
                  <Th>Status</Th>
                  <Th>Valid Until</Th>
                  <Th>Days Left</Th>
                  <Th>Auto Renewal</Th>
                  <Th>Handshake</Th>
                  <Th aria-label="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {filtered.map((r) => {
                  const daysColor =
                    r.daysRemaining == null
                      ? undefined
                      : r.daysRemaining < 0
                      ? STATUS_META.failing.color
                      : r.daysRemaining < 7
                      ? STATUS_META.failing.color
                      : r.daysRemaining < 30
                      ? STATUS_META.warning.color
                      : STATUS_META.healthy.color;
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Link to={r.href.troubleshooting} className="rhcl-tls-overview-hostname">
                          {r.hostname}
                        </Link>
                      </Td>
                      <Td>{r.gatewayName || '—'}</Td>
                      <Td>{r.certificateName}</Td>
                      <Td>
                        <Tooltip content={r.issuerName || r.issuerLabel}>
                          <span>{r.issuerLabel}</span>
                        </Tooltip>
                      </Td>
                      <Td>
                        <Label color={STATUS_COLOR[r.status]} icon={STATUS_ICON[r.status]} isCompact>
                          {STATUS_LABEL[r.status]}
                        </Label>
                      </Td>
                      <Td>
                        {r.validUntil
                          ? new Date(r.validUntil).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </Td>
                      <Td style={{ color: daysColor, fontWeight: 500 }}>
                        {r.daysRemaining == null
                          ? '—'
                          : r.daysRemaining < 0
                          ? `-${Math.abs(r.daysRemaining)} days`
                          : `${r.daysRemaining} days`}
                      </Td>
                      <Td>
                        <span
                          style={{
                            display: 'inline-flex',
                            gap: 4,
                            alignItems: 'center',
                            color: RENEWAL_META[r.renewal].color,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: RENEWAL_META[r.renewal].color,
                            }}
                          />
                          {RENEWAL_META[r.renewal].label}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ color: HANDSHAKE_META[r.handshake].color }}>
                          {HANDSHAKE_META[r.handshake].label}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          <Tooltip content="Open TLS Troubleshooting">
                            <Button
                              variant="plain"
                              aria-label="Open troubleshooting"
                              component={(props) => (
                                <Link {...props} to={r.href.troubleshooting} />
                              )}
                            >
                              <ArrowRightIcon />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Open Certificate">
                            <Button
                              variant="plain"
                              aria-label="Open certificate"
                              component={(props) => (
                                <Link {...props} to={r.href.certificate} />
                              )}
                            >
                              <ExternalLinkAltIcon />
                            </Button>
                          </Tooltip>
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default TLSOverviewTable;
