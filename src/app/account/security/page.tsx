import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import MfaSettings from "./mfa-settings";

export default async function AccountSecurityPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabledAt: true }
  });
  const recoveryCodeCount = await prisma.mfaRecoveryCode.count({
    where: { userId, usedAt: null }
  });

  return (
    <main className="auth-page">
      <MfaSettings enabled={Boolean(user?.mfaEnabledAt)} initialRecoveryCodeCount={recoveryCodeCount} />
    </main>
  );
}
