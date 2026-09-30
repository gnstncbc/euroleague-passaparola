"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./Admin.module.css";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error ?? "Giriş başarısız");
  };

  return (
    <div className={s.loginWrap}>
      <form className={s.loginCard} onSubmit={submit}>
        <h1 className={s.brand}>
          Passaparola <span>Admin</span>
        </h1>
        {!configured ? (
          <p className={s.warn}>
            <strong>ADMIN_PASSWORD</strong> ortam değişkeni tanımlı değil. Vercel &gt; Settings &gt; Environment
            Variables kısmından ekleyip yeniden deploy et.
          </p>
        ) : (
          <>
            <input
              className={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre"
              autoFocus
              autoComplete="current-password"
            />
            {error && <p className={s.error}>{error}</p>}
            <button className={s.primary} disabled={busy || !password}>
              {busy ? "…" : "Giriş"}
            </button>
          </>
        )}
        <a className={s.link} href="/">← Oyuna dön</a>
      </form>
    </div>
  );
}
