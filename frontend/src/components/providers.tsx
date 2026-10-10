"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { api } from "@/lib/api";
import { currentToken, setUser } from "@/lib/auth";

/** Confirms a stored sign-in is still live. A 401 from the API clears it. */
function SessionCheck() {
  useEffect(() => {
    const token = currentToken();
    if (!token) return;
    api
      .me()
      .then((me) => {
        if (currentToken() === token) setUser({ ...me, token });
      })
      .catch(() => {});
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <SessionCheck />
      {children}
    </ThemeProvider>
  );
}
