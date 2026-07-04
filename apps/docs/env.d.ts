/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Stable ambient refs for the standalone `tsc` typecheck (tsconfig.typecheck.json).
// Next rewrites next-env.d.ts on every dev/build to also reference the generated
// `.next/types/routes.d.ts` — which is gitignored and absent on a fresh checkout, so
// the nx typecheck can't depend on it. This file carries only the always-present refs
// (Next's global + image types cover `*.css` side-effect imports and JSX globals).
