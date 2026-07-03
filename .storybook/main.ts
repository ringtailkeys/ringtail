import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Ringtail Storybook — lives at the repo ROOT so it can showcase BOTH the design
 * system (libs/ui) and the cockpit demo flows (apps/dashboard) in one book.
 * React + Vite builder. Workspace packages (@ringtail/ui) resolve via their
 * package `exports` — no aliases needed.
 */
const config: StorybookConfig = {
  stories: [
    "../libs/ui/src/**/*.stories.@(ts|tsx)",
    "../apps/dashboard/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
};

export default config;
