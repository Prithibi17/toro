"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, firebaseConfigured } from "@/lib/firebase-client";
import { ArrowRight, LoaderCircle } from "lucide-react";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function establish(user: import("firebase/auth").User) {
    const idToken = await user.getIdToken(true);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.verificationRequired) {
        router.push("/verify-email");
        return;
      }
      throw new Error(json.error || "Could not start session");
    }
    router.push("/select-company");
    router.refresh();
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!auth)
      return setError(
        "Firebase is not configured. Add the environment variables first.",
      );
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const email = String(data.get("email")),
        password = String(data.get("password"));
      if (mode === "register") {
        const result = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await updateProfile(result.user, {
          displayName: String(data.get("name")),
        });
        await sendEmailVerification(result.user);
        router.push("/verify-email");
      } else
        await establish(
          (await signInWithEmailAndPassword(auth, email, password)).user,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (!auth) return setError("Firebase is not configured.");
    setBusy(true);
    try {
      await establish(
        (await signInWithPopup(auth, new GoogleAuthProvider())).user,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {!firebaseConfigured && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
          Connect Firebase in <code>.env.local</code> to enable real
          authentication.
        </div>
      )}
      {mode === "register" && (
        <label>
          <span className="label">Full name</span>
          <input className="input" name="name" autoComplete="name" required />
        </label>
      )}
      <label>
        <span className="label">Work email</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </label>
      <label>
        <span className="label">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </label>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn btn-primary w-full">
        {busy ? (
          <LoaderCircle className="animate-spin" size={18} />
        ) : (
          <>
            {mode === "login" ? "Sign in" : "Create account"}
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <div className="flex items-center gap-3 text-xs muted">
        <span className="h-px flex-1 bg-[var(--border)]" />
        OR
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <button
        type="button"
        onClick={google}
        className="btn btn-secondary w-full"
      >
        <GoogleLogo />
        Continue with Google
      </button>
      <p className="text-center text-sm muted">
        {mode === "login" ? "New to Toro? " : "Already have an account? "}
        <Link
          className="font-semibold text-[var(--accent)]"
          href={mode === "login" ? "/register" : "/login"}
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.88A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.28.31-1.88v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.48l3.35-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.79.5 3.82 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.6C7.18 7.75 9.39 5.99 12 5.99Z"
      />
    </svg>
  );
}
