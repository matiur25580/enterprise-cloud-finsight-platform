import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">fin<span>sight</span></Link>
        <p className="auth-eyebrow">ACCESS RESTRICTED</p>
        <h1>You don&apos;t have permission</h1>
        <p className="auth-description">Your account does not have the required role for this organization action.</p>
        <Link className="auth-switch" href="/workspace">Return to workspace</Link>
      </section>
    </main>
  );
}
