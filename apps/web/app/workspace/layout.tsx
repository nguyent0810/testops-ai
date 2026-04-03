import { UserButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ws-shell-root">
      <header className="ws-shell-header">
        <div className="ws-shell-header-inner">
          <span className="ws-shell-brand">Internal Alpha</span>
          <span className="ws-shell-sub">Document → requirements → test cases</span>
        </div>
        <UserButton />
      </header>
      <div className="ws-shell-body">{children}</div>
    </div>
  );
}
