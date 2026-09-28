"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { browserDb } from "@/lib/browser";
import ThemeToggle from "@/components/theme-toggle";

export default function AccessPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const client = browserDb();
    if (!client) {
      setError("Configura Supabase para iniciar sesión.");
      setBusy(false);
      return;
    }
    const result =
      mode === "login"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });
    if (result.error) setError(result.error.message);
    else if (result.data.session) router.push("/panel");
    else
      setInfo(
        "Revisa tu correo para confirmar la cuenta y luego inicia sesión.",
      );
    setBusy(false);
  }
  return (
    <main className="access-page">
      <div className="access-brand">
        <div className="access-brand-top">
          <Link href="/" className="brand">
            mesa<span>viva</span>
            <i>.</i>
          </Link>
          <ThemeToggle />
        </div>
        <div>
          <span className="eyebrow">TODO EN SU LUGAR</span>
          <h1>
            El servicio
            <br />
            <em>fluye mejor.</em>
          </h1>
          <p>Tu menú, cocina, mesas y ventas trabajando juntos.</p>
        </div>
        <small>Una experiencia para todo el equipo.</small>
      </div>
      <div className="access-form-wrap">
        <form className="access-form" onSubmit={submit}>
          <span className="eyebrow">ACCESO DEL EQUIPO</span>
          <h2>{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h2>
          <p>
            {mode === "login"
              ? "Ingresa para administrar tu restaurante."
              : "Comienza con tu restaurante en pocos pasos."}
          </p>
          <label className="field-label" htmlFor="email">
            Correo electrónico
          </label>
          <input
            className="input"
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="field-label" htmlFor="password">
            Contraseña
          </label>
          <input
            className="input"
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <div className="notice error">{error}</div>}
          {info && <div className="notice success">{info}</div>}
          <button className="button button-primary full" disabled={busy}>
            {busy
              ? "Un momento…"
              : mode === "login"
                ? "Entrar al panel"
                : "Crear cuenta"}
            <ArrowRight size={18} />
          </button>
          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "¿Primera vez aquí? Crear cuenta"
              : "¿Ya tienes cuenta? Iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
