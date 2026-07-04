import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared layout options (nav title, links) for the docs + any home layout.
 * Rocco in the wordmark keeps the brand present in the chrome.
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <span aria-hidden>🦝</span> Ringtail
      </>
    ),
  },
  githubUrl: "https://github.com/ringtailkeys/ringtail",
  links: [{ text: "ringtailkeys.com", url: "https://ringtailkeys.com", external: true }],
};
