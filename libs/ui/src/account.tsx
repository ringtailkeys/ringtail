import type { CSSProperties } from "react";
import { Reveal, revealStyle, ANIM_CLASS } from "./anim";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card, Eyebrow } from "./card";
import { Skeleton } from "./feedback";
import { Rocco, roccoLine } from "./rocco";
import { font, radius } from "./tokens";

/**
 * AccountView — the ONE branded account surface shared by the native app, the (future)
 * web `apps/app`, and the OSS dashboard (app edition only). DRY, "just like the
 * dashboard": Night Shift tokens, Rocco, the `--ease-snap` spring.
 *
 * PRESENTATIONAL + data-source-agnostic on purpose: it takes plain props and two
 * callbacks — NO daemon/store/node imports — so a daemon-fed dashboard AND a direct-API
 * web app can both render it. The parent owns the money path (`onManageBilling` → the
 * hosted billing portal) and the session (`onSignOut`); no secret ever touches this file.
 */
export interface AccountViewProps {
  tier: "free" | "pro";
  email: string;
  /** ISO date — the Pro renewal date. Omitted/undefined → no renewal line (e.g. free). */
  expiresAt?: string;
  /** The server-side provision count that gates the free tier. */
  usage: { projectsProvisioned: number; freeLimit: number };
  /** Open the hosted billing portal (Dodo) — manage/cancel the subscription (pro tier). */
  onManageBilling: () => void;
  /** Start the free→Pro upgrade (Dodo checkout). Free tier only; distinct from billing. */
  onUpgrade?: () => void;
  /** Drop the local session. */
  onSignOut: () => void;
  /** Entitlement still loading → skeletons (no flash of a wrong tier). */
  loading?: boolean;
}

const label: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-soft)",
};

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** The X / Y projects meter. Pro → uncapped (no track, just the count). Free → a bar
 * that fills amber, flipping to `hot` at the limit (the nudge to upgrade). Green stays
 * SACRED (scope-validated only) so it is deliberately NOT a fill color here. */
function UsageMeter({
  tier,
  usage,
}: {
  tier: "free" | "pro";
  usage: { projectsProvisioned: number; freeLimit: number };
}) {
  const { projectsProvisioned, freeLimit } = usage;
  if (tier === "pro") {
    return (
      <div>
        <div style={{ ...label, marginBottom: 8 }}>projects</div>
        <div style={{ fontFamily: font.display, fontSize: "1.5rem", letterSpacing: "-0.01em" }}>
          {projectsProvisioned}{" "}
          <span style={{ color: "var(--ink-soft)", fontSize: "1rem" }}>· unlimited</span>
        </div>
      </div>
    );
  }
  const atLimit = projectsProvisioned >= freeLimit;
  const pct = freeLimit > 0 ? Math.min(100, (projectsProvisioned / freeLimit) * 100) : 100;
  const fill = atLimit ? "var(--hot)" : "var(--amber)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={label}>projects</span>
        <span style={{ ...label, color: atLimit ? "var(--hot)" : "var(--ink-soft)" }}>
          {projectsProvisioned} / {freeLimit}
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: radius.pill,
          background: "color-mix(in srgb, var(--ink) 8%, transparent)",
          overflow: "hidden",
        }}
      >
        <div
          className={ANIM_CLASS}
          style={{
            height: "100%",
            width: `${pct}%`,
            background: fill,
            borderRadius: radius.pill,
            transition: "width var(--dur-slow,400ms) var(--ease-snap)",
          }}
        />
      </div>
      {atLimit && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: "var(--hot)", margin: "10px 0 0" }}>
          free limit reached — go Pro for unlimited raids
        </p>
      )}
    </div>
  );
}

export function AccountView({
  tier,
  email,
  expiresAt,
  usage,
  onManageBilling,
  onUpgrade,
  onSignOut,
  loading,
}: AccountViewProps) {
  if (loading) {
    return (
      <Card style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <Skeleton style={{ width: 72, height: 72, borderRadius: radius.md }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ width: "60%", height: 14, marginBottom: 10 }} />
            <Skeleton style={{ width: "40%", height: 12 }} />
          </div>
        </div>
        <Skeleton style={{ width: "100%", height: 8, marginBottom: 24 }} />
        <Skeleton style={{ width: "100%", height: 40 }} />
      </Card>
    );
  }

  const isPro = tier === "pro";
  const renews = fmtDate(expiresAt);

  return (
    <Card style={{ maxWidth: 480 }}>
      <Reveal>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
          <Rocco pose="chill" animated size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Eyebrow>account</Eyebrow>
              <Badge tone={isPro ? "amber" : "neutral"}>{isPro ? "Pro" : "Free"}</Badge>
            </div>
            <h2
              style={{
                fontFamily: font.display,
                fontSize: "1.25rem",
                margin: 0,
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </h2>
            {isPro && renews && (
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  margin: "6px 0 0",
                }}
              >
                renews {renews}
              </p>
            )}
          </div>
        </div>
      </Reveal>

      <div className={ANIM_CLASS} style={{ ...revealStyle(80), marginBottom: 24 }}>
        <UsageMeter tier={tier} usage={usage} />
      </div>

      <div
        className={ANIM_CLASS}
        style={{
          ...revealStyle(140),
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Button variant="ghost" onClick={onSignOut}>
          sign out
        </Button>
        <Button onClick={isPro ? onManageBilling : onUpgrade}>
          {isPro ? "manage subscription →" : "upgrade to Pro →"}
        </Button>
      </div>

      {!isPro && (
        <p
          style={{
            fontFamily: font.ui,
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
            margin: "16px 0 0",
          }}
        >
          “{roccoLine("chill")}”
        </p>
      )}
    </Card>
  );
}
