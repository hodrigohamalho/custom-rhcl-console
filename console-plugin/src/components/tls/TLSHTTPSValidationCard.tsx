import * as React from 'react';
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Label,
  Tooltip,
} from '@patternfly/react-core';
import { LockIcon, ExternalLinkAltIcon } from '@patternfly/react-icons';

/**
 * Live HTTPS handshake check card. The button is intentionally
 * disabled in this build — a real HTTPS probe needs a cluster-side
 * companion service (same pattern as the DNS prober) and that's tracked
 * separately. When the companion lands, the button will POST to it and
 * populate the rows below with the actual handshake result.
 *
 * Rows shown even without a live probe so the operator knows what the
 * companion will surface, and so the "expected: OK vs expected: fail"
 * derived from the pipeline still reads.
 */

interface Props {
  hostname: string;
  /** Whether the pipeline predicts a successful handshake. Drives the
   *  "expected" rows below. */
  handshakeExpectedOk: boolean;
}

const TLSHTTPSValidationCard: React.FC<Props> = ({ hostname, handshakeExpectedOk }) => {
  const endpoint = hostname ? `https://${hostname}` : '—';
  return (
    <Card aria-label="HTTPS validation" className="rhcl-tls-panel">
      <CardTitle>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <LockIcon /> HTTPS Validation
          <Tooltip content="Live probe requires a cluster-side companion service. Not shipped in this build.">
            <Label color="grey" isCompact>
              expected
            </Label>
          </Tooltip>
        </span>
      </CardTitle>
      <CardBody>
        <dl className="rhcl-tls-details-grid">
          <dt>HTTPS Endpoint</dt>
          <dd>
            {hostname ? (
              <a href={endpoint} target="_blank" rel="noopener noreferrer">
                {endpoint} <ExternalLinkAltIcon />
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt>TLS Handshake</dt>
          <dd>{handshakeExpectedOk ? 'expected OK' : 'expected failure'}</dd>
          <dt>TLS Version</dt>
          <dd>—</dd>
          <dt>Cipher Suite</dt>
          <dd>—</dd>
          <dt>Certificate Chain</dt>
          <dd>{handshakeExpectedOk ? 'expected valid' : 'chain check will fail'}</dd>
          <dt>OCSP Stapling</dt>
          <dd>—</dd>
          <dt>HTTP Status</dt>
          <dd>—</dd>
          <dt>Latency</dt>
          <dd>—</dd>
        </dl>
        <div style={{ marginTop: 12 }}>
          <Tooltip content="Requires the tls-prober companion service (roadmap).">
            <Button variant="primary" isDisabled>
              Run HTTPS Check
            </Button>
          </Tooltip>
        </div>
      </CardBody>
    </Card>
  );
};

export default TLSHTTPSValidationCard;
