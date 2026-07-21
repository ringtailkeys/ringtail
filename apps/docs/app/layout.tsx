import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    template: "%s · Ringtail",
    default: "Ringtail — the OSS raccoon that raids the token pages so you don't",
  },
  description:
    "Local, open-source, agent-orchestrated credential provisioning. The agent never sees a secret value.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* `type: "static"` → the search dialog fetches the prebuilt index from
            /api/search (fumadocs staticGET) and searches client-side. Required for
            the static export; without it the dialog would hit a live search server. */}
        <RootProvider search={{ options: { type: "static" } }}>{children}</RootProvider>
      </body>
    </html>
  );
}
