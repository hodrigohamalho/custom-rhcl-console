import * as React from 'react';
import {
  Button,
  Spinner,
  Alert,
  TextArea,
  Flex,
  FlexItem,
  ClipboardCopy,
  ClipboardCopyVariant,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { mcpInitialize, mcpListTools, mcpCallTool, McpTool } from './mcpBrokerClient';

/**
 * In-console "try it" — connects to the MCP broker through the console proxy,
 * lists the federated tools (filtered to this server's prefix) and calls one
 * live. `initialize → tools/list → tools/call` over Streamable HTTP, all via
 * `mcpBrokerClient`.
 *
 * Requires the `mcp-broker` proxy alias on the ConsolePlugin CR (see the
 * custom_console role) pointing at a TLS-fronted broker Service. Until that's
 * present the connect step surfaces a clear, actionable error rather than a
 * silent failure.
 */
const MCPPlayground: React.FC<{ prefix?: string }> = ({ prefix }) => {
  const { t } = useTranslation('plugin__custom-rhcl-console');
  const [session, setSession] = React.useState<string | null>(null);
  const [tools, setTools] = React.useState<McpTool[] | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<McpTool | null>(null);
  const [argsText, setArgsText] = React.useState('{}');
  const [calling, setCalling] = React.useState(false);
  const [callResult, setCallResult] = React.useState<string | null>(null);

  const connect = async () => {
    setStatus('connecting');
    setError(null);
    try {
      const s = await mcpInitialize();
      if (!s) throw new Error(t('The broker did not return a session id.'));
      const all = await mcpListTools(s);
      const filtered = prefix ? all.filter((x) => x.name.startsWith(prefix)) : all;
      setSession(s);
      setTools(filtered);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const call = async () => {
    if (!session || !selected) return;
    setCalling(true);
    setCallResult(null);
    try {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsText || '{}');
      } catch {
        throw new Error(t('Arguments must be valid JSON.'));
      }
      const r = await mcpCallTool(session, selected.name, args);
      setCallResult(JSON.stringify(r, null, 2));
    } catch (e) {
      setCallResult(`${t('Error')}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCalling(false);
    }
  };

  if (status === 'idle') {
    return (
      <div>
        <p style={{ color: 'var(--pf-v5-global--Color--200)', marginBottom: 12 }}>
          {t('Connect to the broker to list this server’s tools and call one live.')}
        </p>
        <Button variant="secondary" onClick={connect}>
          {t('Connect to broker')}
        </Button>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
        <FlexItem>
          <Spinner size="md" />
        </FlexItem>
        <FlexItem>{t('Connecting to the MCP broker…')}</FlexItem>
      </Flex>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant="warning" isInline title={t('Could not reach the MCP broker')}>
        <p>{error}</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          {t(
            'The playground calls the broker through the console’s "mcp-broker" proxy. Ensure the MCP Gateway is installed and the ConsolePlugin proxy alias points at a TLS-fronted broker Service (see tests/req073).',
          )}
        </p>
        <Button variant="link" isInline onClick={connect} style={{ marginTop: 8 }}>
          {t('Retry')}
        </Button>
      </Alert>
    );
  }

  // ready
  return (
    <div>
      {tools && tools.length === 0 ? (
        <p style={{ color: 'var(--pf-v5-global--Color--200)' }}>
          {t('The broker reported no tools for this prefix yet.')}
        </p>
      ) : (
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          <FlexItem>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--pf-v5-global--Color--200)', marginBottom: 6 }}>
              {t('Tools')}
            </div>
            <Flex spaceItems={{ default: 'spaceItemsXs' }} style={{ flexWrap: 'wrap' }}>
              {(tools || []).map((tool) => (
                <FlexItem key={tool.name}>
                  <Button
                    variant={selected?.name === tool.name ? 'primary' : 'tertiary'}
                    onClick={() => {
                      setSelected(tool);
                      setCallResult(null);
                    }}
                  >
                    <code>{tool.name}</code>
                  </Button>
                </FlexItem>
              ))}
            </Flex>
          </FlexItem>

          {selected && (
            <>
              {selected.description && (
                <FlexItem>
                  <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>{selected.description}</span>
                </FlexItem>
              )}
              <FlexItem>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--pf-v5-global--Color--200)', marginBottom: 6 }}>
                  {t('Arguments (JSON)')}
                </div>
                <TextArea
                  aria-label={t('Arguments (JSON)')}
                  value={argsText}
                  onChange={(_e, v) => setArgsText(v)}
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" onClick={call} isLoading={calling} isDisabled={calling}>
                  {t('Call {{tool}}', { tool: selected.name })}
                </Button>
              </FlexItem>
            </>
          )}

          {callResult !== null && (
            <FlexItem>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--pf-v5-global--Color--200)', marginBottom: 6 }}>
                {t('Result')}
              </div>
              <ClipboardCopy
                isCode
                isReadOnly
                variant={ClipboardCopyVariant.expansion}
                hoverTip={t('Copy')}
                clickTip={t('Copied')}
              >
                {callResult}
              </ClipboardCopy>
            </FlexItem>
          )}
        </Flex>
      )}
    </div>
  );
};

export default MCPPlayground;
