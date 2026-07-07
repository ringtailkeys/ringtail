import { Rocco } from "@/components/rocco";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step, Steps } from "fumadocs-ui/components/steps";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

/** Merge Fumadocs's default MDX components (callouts, code blocks) with the extra
 *  layout components our pages use (Cards, Steps), plus any page overrides. Every
 *  doc page renders through this, so pages can use <Cards>/<Steps> without imports. */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Card, Cards, Step, Steps, Rocco, ...components };
}
