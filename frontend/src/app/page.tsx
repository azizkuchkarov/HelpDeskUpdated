"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default function Home() {
  const { token, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token && user) {
      router.replace("/dashboard");
    }
  }, [token, user, router]);

  if (token && user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-900 via-primary-800/60 to-primary-600/70" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(255,255,255,0.08),transparent)]" />
      <LoginForm />
    </div>
  );
}
