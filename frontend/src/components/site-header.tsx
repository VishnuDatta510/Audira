"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { setUser, useUser } from "@/lib/auth";
import { cx } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";
import { LinkButton } from "@/components/ui/button";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect width="28" height="28" rx="8" className="fill-accent" />
      <path d="M8 9.5h7.5M8 14h12M8 18.5h5" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="17" y="16.4" width="2.4" height="4.2" rx="1.2" className="fill-(--accent-ink)" />
    </svg>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-[17px] font-semibold text-ink">
      <BrandMark className="size-7" />
      BNB <span className="font-normal text-ink-3">Interviews</span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const signOut = () => {
    setUser(null);
    router.replace("/");
  };
  const links = user?.role === "admin" ? [{ href: "/admin", label: "Interviews" }] : [];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:gap-8 sm:px-8">
        <Brand />
        <nav className="flex items-center gap-1">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                pathname.startsWith(item.href) ? "text-ink font-medium" : "text-ink-2 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-2 pl-1">
              <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent" title={user.email}>
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <button onClick={signOut} className="rounded-md p-2 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <LinkButton href="/sign-in" variant="ghost" size="sm">
              Sign in
            </LinkButton>
          )}
        </div>
      </div>
    </header>
  );
}
