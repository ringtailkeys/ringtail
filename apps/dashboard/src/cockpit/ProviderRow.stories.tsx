import { type CredentialStatus, font } from "@ringtail/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { ProviderRow } from "./ConnectionGrid";
import { ENVS, providerInState } from "./fixtures";

/** ProviderRow lives in a <table>; wrap each story so the HTML is valid. */
function RowTable({ status }: { status: CredentialStatus }) {
  return (
    <div style={{ background: "var(--bg)", padding: 24, borderRadius: "var(--r-md)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "0 12px 10px",
                fontFamily: font.mono,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--ink-soft)",
              }}
            >
              provider
            </th>
            {ENVS.map((e) => (
              <th
                key={e}
                style={{
                  textAlign: "center",
                  padding: "0 12px 10px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ink-soft)",
                }}
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ProviderRow provider={providerInState(status)} />
        </tbody>
      </table>
    </div>
  );
}

const meta = {
  title: "Flows/Provider Row",
  component: ProviderRow,
  args: { provider: providerInState("missing") },
} satisfies Meta<typeof ProviderRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Missing: Story = { render: () => <RowTable status="missing" /> };
export const NeedsConsent: Story = { render: () => <RowTable status="needs-consent" /> };
export const Validating: Story = { render: () => <RowTable status="validating" /> };
export const Validated: Story = { render: () => <RowTable status="validated" /> };
export const WrongScope: Story = { render: () => <RowTable status="wrong-scope" /> };
export const Provisioning: Story = { render: () => <RowTable status="provisioning" /> };
export const Synced: Story = { render: () => <RowTable status="synced" /> };
