// Rocco's PNGs (and any static image) resolve to a URL string when bundled by
// Vite/Storybook. tsc has no bundler, so declare the module shape for typecheck.
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}
