import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
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
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
