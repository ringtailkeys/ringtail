import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Action, DaemonSnapshot } from "@ringtail/core";
import { createDaemon } from "./index";

/**
 * The DIRECTION driver — proves the dashboard is a CONVERSATION (architecture.md
 * §"The dashboard is a conversation" + §"Directable actions"). It plays BOTH sides:
 *   - the USER, via POST /api/chat (user → agent), and
 *   - the AGENT, as a real MCP client (pollChat → renderActions → sendChat).
 *
 * The living-actions proof: a user chat ADDS an action, a second chat REMOVES it,
 * and the SSE snapshot (the panel's source of truth) reflects each re-render live.
 * Asserts throughout — this IS the check. Zero real cloud.
 */

const STRIPE: Action = {
  id: "stripe-setup",
  title: "Set up Stripe",
  why: "User asked for it in chat — wire billing keys across envs.",
  prerequisites: [],
  danger: "safe",
  wizard: {
    id: "wiz-stripe",
    title: "Connect Stripe",
    provider: "stripe",
    steps: [
      {
        id: "stripe-paste",
        title: "Paste your Stripe secret key",
        description: "🔒 goes to Ringtail, not the agent.",
        kind: "paste",
        payload: { varName: "STRIPE_SECRET_KEY" },
        status: "pending",
      },
    ],
  },
};

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "ringtail-chat-"));
  const { app, token } = createDaemon({
    repoName: "ringtail",
    envLocalPath: join(dir, ".env.local"),
  });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  const base = `http://127.0.0.1:${server.port}`;

  console.log("\n── ringtail · the dashboard is a conversation (directable actions) ──");
  console.log(`  daemon : ${base}  (bind 127.0.0.1 only)`);

  // The panel's source of truth: capture the LATEST SSE snapshot the dashboard sees.
  // Assigned inside the SSE closure below; read via `panel()` so TS keeps the union
  // type (control-flow narrowing ignores closure writes, would otherwise infer null).
  let latest: DaemonSnapshot | null = null;
  const panel = (): DaemonSnapshot => {
    if (!latest) throw new Error("no snapshot received yet");
    return latest;
  };
  const sse = await fetch(`${base}/events?token=${token}`);
  const reader = sse.body!.getReader();
  const dec = new TextDecoder();
  void (async () => {
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      let nl: number;
      while ((nl = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (line) latest = JSON.parse(line.slice(6)) as DaemonSnapshot;
      }
    }
  })();

  // The AGENT side: a real MCP client over Streamable HTTP with the session token.
  const client = new Client({ name: "ringtail-chat-driver", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const res = await client.callTool({ name, arguments: args });
    const first = (res.content as Array<{ type: string; text?: string }>)?.[0];
    return JSON.parse(first?.text ?? "{}");
  };

  // The USER side: POST chat text (user → agent), token-gated.
  const userSays = async (text: string): Promise<void> => {
    const r = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`POST /api/chat → ${r.status}`);
  };

  const settle = () => new Promise((r) => setTimeout(r, 40));

  try {
    console.log("\n[1] user → agent : “also set up Stripe”");
    await userSays("also set up Stripe");
    await settle();
    if (!panel().chat.some((m) => m.role === "user" && m.text.includes("Stripe"))) {
      throw new Error("user message did not reach the transcript");
    }

    console.log("[2] agent drains the direction (pollChat):");
    const inbox = await call("pollChat");
    console.log(`      → ${JSON.stringify(inbox.messages)}`);
    if (!inbox.messages.includes("also set up Stripe")) throw new Error("agent did not receive it");

    console.log("[3] agent re-maps → renderActions([stripe]) + sendChat:");
    await call("renderActions", { actions: [STRIPE] });
    await call("sendChat", { message: "Added Stripe to your next actions." });
    await settle();
    console.log(
      `      panel actions → [${panel()
        .actions.map((a) => a.id)
        .join(", ")}]`,
    );
    if (panel().actions.length !== 1 || panel().actions[0]?.id !== "stripe-setup") {
      throw new Error("action was NOT added to the live panel");
    }

    console.log("\n[4] user → agent : “skip Stripe”");
    await userSays("skip Stripe");
    await settle();

    console.log("[5] agent drains + re-maps → renderActions([]) (action removed):");
    const inbox2 = await call("pollChat");
    if (!inbox2.messages.includes("skip Stripe")) throw new Error("agent did not receive the skip");
    await call("renderActions", { actions: [] });
    await call("sendChat", { message: "Done — removed Stripe." });
    await settle();
    console.log(
      `      panel actions → [${
        panel()
          .actions.map((a) => a.id)
          .join(", ") || ""
      }]`,
    );
    if (panel().actions.length !== 0) throw new Error("action was NOT removed from the live panel");

    // The whole conversation the panel now shows (agent + user, in order).
    console.log("\n── transcript (what the chat panel renders) ──");
    for (const m of panel().chat) console.log(`  ${m.role === "agent" ? "🦝" : "🙂"} ${m.text}`);

    // THE GUARANTEE, re-checked on this channel: nothing here is a secret value.
    const wire = JSON.stringify(panel());
    if (/sk_live|secret[-_]?key.*=/.test(wire))
      throw new Error("a secret leaked into chat/actions");

    console.log(
      "\n✓ directable actions proven: user chat → agent re-map → panel re-rendered live.\n",
    );
  } finally {
    await reader.cancel();
    await client.close();
    await server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
