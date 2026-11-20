import Link from "next/link";
import { auth } from "@/auth";
import InvitationAccept from "./invitation-accept";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ token }, session] = await Promise.all([searchParams, auth()]);
  const safeToken = typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : "";
  return <main className="auth-page">
    {!session?.user?.id ? <section className="auth-card">
      <Link className="auth-brand" href="/">fin<span>sight</span></Link>
      <p className="auth-eyebrow">ORGANIZATION INVITATION</p><h1>Sign in to accept</h1>
      <p className="auth-description">Sign in or create an account using the email address that received this invitation, then reopen the invitation link.</p>
      <Link className="auth-primary-link" href="/login">Sign in</Link>
    </section> : safeToken ? <InvitationAccept token={safeToken} /> : <section className="auth-card"><h1>Invalid invitation link</h1><p className="auth-description">The invitation token is missing or malformed. Ask an organization administrator to send a new invitation.</p><Link href="/workspace">Go to workspace</Link></section>}
  </main>;
}
