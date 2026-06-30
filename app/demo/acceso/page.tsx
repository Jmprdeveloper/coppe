import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoAccessClient } from "../../../components/DemoAccessClient";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Acceso de demostración | COPPE",
};

export default function DemoAccessPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <DemoAccessClient />;
}
