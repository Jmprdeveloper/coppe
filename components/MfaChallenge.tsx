"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";

type MfaChallengeProps = {
  onVerified: () => void;
  onSignOut: () => void;
};

export function MfaChallenge({
  onVerified,
  onSignOut,
}: MfaChallengeProps) {
  const supabase = useMemo(() => createClient(), []);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadFactor() {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (!mounted) {
        return;
      }

      if (error || !data?.totp?.[0]) {
        setErrorMessage(
          "No se pudo cargar el segundo factor de esta cuenta."
        );
        setIsLoading(false);
        return;
      }

      setFactorId(data.totp[0].id);
      setIsLoading(false);
    }

    loadFactor();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const handleVerify = async () => {
    const cleanCode = code.replace(/\s+/g, "");

    setErrorMessage("");

    if (!factorId) {
      setErrorMessage("No hay ningún segundo factor disponible.");
      return;
    }

    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMessage("Introduce el código de 6 dígitos.");
      return;
    }

    setIsVerifying(true);

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: cleanCode,
    });

    setIsVerifying(false);

    if (error) {
      setErrorMessage(
        "El código no es válido o ha caducado. Genera uno nuevo e inténtalo otra vez."
      );
      return;
    }

    onVerified();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
          <KeyRound size={22} />
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-950">
          Verificación en dos pasos
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Introduce el código actual de tu aplicación de autenticación.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Código de 6 dígitos
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setErrorMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isVerifying && !isLoading) {
                handleVerify();
              }
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={isLoading || isVerifying}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-[#0F4C5C] disabled:opacity-60"
            placeholder="000000"
          />
        </label>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Button
          className="mt-5 w-full"
          onClick={handleVerify}
          disabled={isLoading || isVerifying}
        >
          {isLoading
            ? "Cargando factor..."
            : isVerifying
              ? "Verificando..."
              : "Verificar y entrar"}
        </Button>

        <Button
          className="mt-3 w-full"
          variant="secondary"
          onClick={onSignOut}
          disabled={isVerifying}
        >
          <LogOut size={16} />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
