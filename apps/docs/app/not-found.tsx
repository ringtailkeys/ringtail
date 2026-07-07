import { Rocco } from "@/components/rocco";
import Link from "next/link";

/**
 * 404 — Rocco raided off somewhere. Static-export safe (no server APIs); renders inside
 * the root layout, so it inherits the Night Shift theme vars from global.css.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 1.5rem",
        textAlign: "center",
        color: "var(--color-fd-foreground)",
      }}
    >
      <Rocco pose="mindblown" size={140} caption />
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
        404 — this page raided off somewhere
      </h1>
      <p style={{ color: "var(--color-fd-muted-foreground)", maxWidth: "28rem", margin: 0 }}>
        Rocco can't find that token page. It was either moved, minted, or flicked for a bad scope.
      </p>
      <Link
        href="/docs"
        style={{
          marginTop: "0.5rem",
          padding: "0.6rem 1.2rem",
          borderRadius: 10,
          fontWeight: 600,
          background: "var(--color-fd-primary)",
          color: "var(--color-fd-primary-foreground)",
          textDecoration: "none",
        }}
      >
        Back to the docs
      </Link>
    </main>
  );
}
