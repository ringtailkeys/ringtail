import { redirect } from "next/navigation";

/** The docs site is all docs — send the root at the Quickstart. */
export default function Home() {
  redirect("/docs");
}
