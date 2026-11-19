import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FinSight | Cloud Cost Intelligence",
    template: "%s | FinSight"
  },
  description:
    "A cloud financial operations workspace for understanding, allocating, and optimizing infrastructure spend.",
  applicationName: "FinSight"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
