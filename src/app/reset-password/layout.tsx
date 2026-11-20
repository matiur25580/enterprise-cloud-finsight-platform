import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password | FinSight",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
