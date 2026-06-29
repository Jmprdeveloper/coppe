"use client";

import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";

type PasswordRecoveryProps = {
  onCompleted: () => void;
};

export function PasswordRecovery({ onCompleted }: PasswordRecoveryProps) {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleUpdatePassword = async () => {
    setErrorMessage("");

    if (password.length < 10) {
      setErrorMessage("La contraseña debe tener al menos 10 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setIsSaving(false);
      setErrorMessage(
        error.message || "No se pudo actualizar la contraseña."
      );
      return;
    }

    await supabase.auth.signOut({ scope: "global" });
    setIsSaving(false);
    onCompleted();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
          <KeyRound size={22} />
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-950">
          Crear una nueva contraseña
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          La nueva contraseña cerrará las demás sesiones de tu cuenta.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Nueva contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage("");
              }}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Repetir contraseña
            <input
              type="password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setErrorMessage("");
              }}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C]"
            />
          </label>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <Button
          className="mt-5 w-full"
          onClick={handleUpdatePassword}
          disabled={isSaving}
        >
          {isSaving ? "Actualizando contraseña..." : "Guardar contraseña"}
        </Button>
      </div>
    </div>
  );
}
