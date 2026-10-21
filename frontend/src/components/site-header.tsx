"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { signOut } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { cx } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";
import { LinkButton } from "@/components/ui/button";

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const scrolled = useScrolled();
  const leave = async () => {
    await signOut();
    router.replace("/");
  };
  const links = user?.workspace
    ? [
        { href: "/admin", label: "Interviews" },
        { href: "/team", label: "Team" },
      ]
    : [];
  return (
    <header
      className={cx(
        "sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-500 ease-expo",
        scrolled ? "border-line bg-bg/80 shadow-[0_8px_24px_-18px_hsl(var(--shadow-color)/0.35)] backdrop-blur-xl backdrop-saturate-150" : "border-transparent bg-bg/0",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-5 sm:gap-8 sm:px-8">
        {/* On phones the nav needs the room, so the mark stands alone. */}
        <Brand className={cx("shrink-0", links.length > 0 && "max-sm:*:last:hidden")} />
        <nav className="flex items-center gap-1">
          {links.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "group relative rounded-lg px-3 py-1.5 text-sm transition-colors duration-300",
                  active ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {item.label}
                <span
                  className={cx(
                    "absolute inset-x-3 -bottom-[13px] h-0.5 origin-left rounded-full bg-accent transition-transform duration-500 ease-expo",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50",
                  )}
                />
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <div className="flex items-center gap-1.5 pl-1">
              <Link
                href="/account"
                className="grid size-8 place-items-center rounded-full bg-accent-soft font-display text-[13px] font-semibold text-accent ring-2 ring-transparent transition-[box-shadow] duration-300 hover:ring-accent/30 animate-pop"
                title={`${user.email} · Account`}
                aria-label="Account"
              >
                {user.name.slice(0, 1).toUpperCase()}
              </Link>
              <button
                onClick={leave}
                className="group grid size-9 place-items-center rounded-[10px] text-ink-3 transition-[background-color,color,transform] duration-300 hover:bg-surface-2 hover:text-ink active:scale-90"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4 transition-transform duration-300 ease-expo group-hover:translate-x-0.5" />
              </button>
            </div>
          ) : (
            <LinkButton href="/sign-in" variant="secondary" size="sm">
              Sign in
            </LinkButton>
          )}
        </div>
      </div>
    </header>
  );
}
