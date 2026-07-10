import * as React from 'react';
import { Card, CardBody, Grid, GridItem } from '@patternfly/react-core';
import {
  LockIcon,
  RedoIcon,
  ClockIcon,
  ShieldAltIcon,
  CheckCircleIcon,
} from '@patternfly/react-icons';
import { STATUS_META } from '../dns/types';
import { Donut, DonutSlice } from './OverviewCharts';
import { KpiCounts } from './useTlsOverview';

/**
 * Five KPI cards along the top of the TLS Overview page. Same
 * "8-10px radius, subtle border, flat body" language as the Overview
 * cards elsewhere in the plugin; a donut sits inside the first card
 * for the health breakdown so the eye lands on where the mass of the
 * problem is at a glance.
 */

const COLORS = {
  healthy: STATUS_META.healthy.color,
  expiring: STATUS_META.warning.color,
  expired: STATUS_META.failing.color,
  error: STATUS_META.unknown.color,
  scheduled: STATUS_META.healthy.color,
  notScheduled: STATUS_META.warning.color,
  failed: STATUS_META.failing.color,
  ok: STATUS_META.healthy.color,
  unknown: STATUS_META.unknown.color,
};

interface Props {
  kpi: KpiCounts;
}

const Row: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="rhcl-tls-overview-kpi-row">
    <span className="rhcl-tls-overview-kpi-swatch" style={{ background: color }} />
    <span className="rhcl-tls-overview-kpi-row-label">{label}</span>
    <span className="rhcl-tls-overview-kpi-row-value">{value}</span>
  </div>
);

const CardShell: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <Card className="rhcl-tls-overview-kpi" isCompact>
    <CardBody>
      <div className="rhcl-tls-overview-kpi-head">
        <span className="rhcl-tls-overview-kpi-icon">{icon}</span>
        <span className="rhcl-tls-overview-kpi-title">{title}</span>
      </div>
      {children}
    </CardBody>
  </Card>
);

const TLSOverviewKPICards: React.FC<Props> = ({ kpi }) => {
  const { overall, renewal, expiringSoon, handshake } = kpi;

  const overallSegments: DonutSlice[] = [
    { label: 'Healthy', value: overall.healthy, color: COLORS.healthy },
    { label: 'Expiring Soon', value: overall.expiring, color: COLORS.expiring },
    { label: 'Expired', value: overall.expired, color: COLORS.expired },
    { label: 'Error', value: overall.error, color: COLORS.error },
  ];

  const pct = (n: number) =>
    overall.total > 0 ? `${Math.round((n / overall.total) * 100)}%` : '0%';

  return (
    <Grid hasGutter>
      <GridItem lg={4} md={12}>
        <CardShell
          title="Overall TLS Health"
          icon={<ShieldAltIcon style={{ color: COLORS.healthy }} />}
        >
          <div className="rhcl-tls-overview-donut-row">
            <Donut
              segments={overallSegments}
              centerValue={overall.total}
              centerLabel="Total"
              size={130}
              strokeWidth={16}
            />
            <div className="rhcl-tls-overview-kpi-rows">
              <Row label={`Healthy · ${pct(overall.healthy)}`} value={overall.healthy} color={COLORS.healthy} />
              <Row label={`Expiring · ${pct(overall.expiring)}`} value={overall.expiring} color={COLORS.expiring} />
              <Row label={`Expired · ${pct(overall.expired)}`} value={overall.expired} color={COLORS.expired} />
              <Row label={`Error · ${pct(overall.error)}`} value={overall.error} color={COLORS.error} />
            </div>
          </div>
        </CardShell>
      </GridItem>

      <GridItem lg={2} md={6}>
        <CardShell
          title="Certificates"
          icon={<LockIcon style={{ color: 'var(--pf-t--global--color--brand--default)' }} />}
        >
          <div className="rhcl-tls-overview-kpi-big">{overall.total}</div>
          <div className="rhcl-tls-overview-kpi-caption">Total</div>
          <div className="rhcl-tls-overview-kpi-microstats">
            <span style={{ color: COLORS.healthy }}>{overall.healthy} Valid</span>
            <span style={{ color: COLORS.expiring }}>{overall.expiring} Exp. Soon</span>
            <span style={{ color: COLORS.expired }}>{overall.expired} Expired</span>
            <span style={{ color: COLORS.error }}>{overall.error} Error</span>
          </div>
        </CardShell>
      </GridItem>

      <GridItem lg={2} md={6}>
        <CardShell
          title="Auto Renewal"
          icon={<RedoIcon style={{ color: COLORS.scheduled }} />}
        >
          <div className="rhcl-tls-overview-kpi-big" style={{ color: COLORS.scheduled }}>
            {renewal.scheduled}
          </div>
          <div className="rhcl-tls-overview-kpi-caption">Scheduled</div>
          <div className="rhcl-tls-overview-kpi-microstats">
            <span style={{ color: COLORS.scheduled }}>{renewal.scheduled} Scheduled</span>
            <span style={{ color: COLORS.notScheduled }}>{renewal.notScheduled} Not Sched.</span>
            <span style={{ color: COLORS.failed }}>{renewal.failed} Failed</span>
          </div>
        </CardShell>
      </GridItem>

      <GridItem lg={2} md={6}>
        <CardShell
          title="Expiring Soon"
          icon={<ClockIcon style={{ color: COLORS.expiring }} />}
        >
          <div className="rhcl-tls-overview-kpi-big" style={{ color: COLORS.expiring }}>
            {expiringSoon.total}
          </div>
          <div className="rhcl-tls-overview-kpi-caption">Within 30 days</div>
          <div className="rhcl-tls-overview-kpi-microstats">
            <span style={{ color: COLORS.expired }}>{expiringSoon.within7} within 7d</span>
            <span style={{ color: COLORS.expiring }}>{expiringSoon.within30} 7-30d</span>
          </div>
        </CardShell>
      </GridItem>

      <GridItem lg={2} md={6}>
        <CardShell
          title="TLS Handshake"
          icon={<CheckCircleIcon style={{ color: COLORS.ok }} />}
        >
          <div className="rhcl-tls-overview-kpi-big" style={{ color: COLORS.ok }}>
            {handshake.ok}
          </div>
          <div className="rhcl-tls-overview-kpi-caption">Predicted OK</div>
          <div className="rhcl-tls-overview-kpi-microstats">
            <span style={{ color: COLORS.ok }}>{handshake.ok} OK</span>
            <span style={{ color: COLORS.failed }}>{handshake.failed} Failed</span>
            <span style={{ color: COLORS.unknown }}>{handshake.unknown} Unknown</span>
          </div>
        </CardShell>
      </GridItem>
    </Grid>
  );
};

export default TLSOverviewKPICards;
