import { allKeyframes, cssVarStyle, graveyard, moonlit } from "@ringtail/ui";
import type { Preview } from "@storybook/react";
import React from "react";
import "../libs/ui/src/tokens.css";

/**
 * Night Shift preview: every story renders on the warm cream / night ground with
 * all @ringtail/ui tokens scoped in, plus the animation keyframes mounted once so
 * live dots, spinners, the glint, and modal transitions run. Toolbar toggles the
 * Moonlit (light) ↔ Graveyard (dark) themes. ZERO telemetry.
 */
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: "Night Shift theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Moonlit (light)" },
          { value: "dark", title: "Graveyard (dark)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const dark = context.globals.theme === "dark";
      return (
        <div
          style={{
            ...cssVarStyle(dark ? graveyard : moonlit),
            background: "var(--bg)",
            color: "var(--ink)",
            fontFamily: "var(--font-ui)",
            minHeight: "100vh",
            padding: 24,
            boxSizing: "border-box",
          }}
        >
          <style>{allKeyframes}</style>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
