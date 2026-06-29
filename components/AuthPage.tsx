"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Building2 } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";

const PUBLIC_SIGNUP_ENABLED = false;
const PRIVATE_ACCESS_MESSAGE =
  "COPPE está actualmente en acceso privado. Las nuevas cuentas se activan por invitación o autorización.";

type AuthPageProps = {
  type: "login" | "register";
  setActiveView: (view: string) => void;
};

function getAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("email not confirmed")) {
    return "El email todavía no está confirmado. Revisa tu correo y confirma la cuenta antes de iniciar sesión.";
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }

  if (
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already registered")
  ) {
    return "Ya existe una cuenta con ese email. Inicia sesión o utiliza otro email.";
  }

  if (normalizedMessage.includes("password should be at least")) {
    return "La contraseña debe tener al menos 10 caracteres.";
  }

  if (normalizedMessage.includes("signup is disabled")) {
    return PRIVATE_ACCESS_MESSAGE;
  }

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "Se han enviado demasiados correos de confirmación. Espera unos minutos antes de intentarlo de nuevo.";
  }

  if (normalizedMessage.includes("unable to validate email address")) {
    return "No se pudo validar el email. Comprueba que la dirección esté bien escrita.";
  }

  if (normalizedMessage.includes("network")) {
    return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }

  return message || "Ha ocurrido un error inesperado.";
}

export function AuthPage({ type, setActiveView }: AuthPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const register = type === "register";
  const signupSubmitDisabled = register && !PUBLIC_SIGNUP_ENABLED;
  const signupToggleDisabled = !register && !PUBLIC_SIGNUP_ENABLED;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isRequestingPasswordReset, setIsRequestingPasswordReset] =
    useState(false);

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (register) {
      setErrorMessage(PRIVATE_ACCESS_MESSAGE);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Introduce un email.");
      return;
    }

    if (!password) {
      setErrorMessage("Introduce una contraseña.");
      return;
    }

    try {
      setIsLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }

      setActiveView("dashboard");
    } catch (error) {
      const message =
        error instanceof Error
          ? getAuthErrorMessage(error.message)
          : "Ha ocurrido un error inesperado.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    const cleanEmail = email.trim().toLowerCase();

    setErrorMessage("");
    setSuccessMessage("");

    if (!cleanEmail) {
      setErrorMessage(
        "Introduce tu email para recibir el enlace de recuperación."
      );
      return;
    }

    setIsRequestingPasswordReset(true);

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin,
    });

    setIsRequestingPasswordReset(false);

    if (error) {
      setErrorMessage(getAuthErrorMessage(error.message));
      return;
    }

    setSuccessMessage(
      "Si la cuenta existe, recibirás un enlace para crear una nueva contraseña."
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FA] px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white">
            <Building2 size={19} />
          </div>

          <div>
            <div className="font-bold text-slate-950">COPPE</div>
            <div className="text-xs text-slate-500">
              {register ? "Crear cuenta" : "Iniciar sesión"}
            </div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {register ? (
            <label className="block text-sm font-medium text-slate-700">
              Nombre completo
              <input
                value={fullName}
                disabled={signupSubmitDisabled}
                onChange={(event) => {
                  setFullName(event.target.value);
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="Tu nombre completo"
              />
            </label>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              disabled={signupSubmitDisabled}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="tu@email.com"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <input
              type="password"
              value={password}
              disabled={signupSubmitDisabled}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#0F4C5C] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="Tu contraseña"
            />
          </label>

          {register ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {PUBLIC_SIGNUP_ENABLED
                ? "Después de crear la cuenta e iniciar sesión, COPPE te pedirá los datos de tu empresa para configurar tu espacio de trabajo."
                : PRIVATE_ACCESS_MESSAGE}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <Button
            className="mt-2 w-full"
            type="submit"
            disabled={isLoading || signupSubmitDisabled}
          >
            {isLoading
              ? register
                ? "Creando cuenta..."
                : "Entrando..."
              : register
                ? "Crear cuenta"
                : "Entrar"}
          </Button>

          {!register ? (
            <button
              type="button"
              className="w-full text-sm font-semibold text-[#0F4C5C] hover:underline"
              onClick={handlePasswordResetRequest}
              disabled={isLoading || isRequestingPasswordReset}
            >
              {isRequestingPasswordReset
                ? "Enviando enlace..."
                : "He olvidado mi contraseña"}
            </button>
          ) : null}

          <button
            type="button"
            disabled={signupToggleDisabled}
            title={signupToggleDisabled ? PRIVATE_ACCESS_MESSAGE : undefined}
            className={`mt-4 w-full text-sm font-semibold ${
              signupToggleDisabled
                ? "cursor-not-allowed text-slate-400"
                : "text-[#0F4C5C] hover:underline"
            }`}
            onClick={() => {
              if (signupToggleDisabled) {
                return;
              }

              setErrorMessage("");
              setSuccessMessage("");
              setActiveView(register ? "login" : "register");
            }}
          >
            {register ? "Ya tengo cuenta" : "Crear cuenta nueva"}
          </button>

          {!register && !PUBLIC_SIGNUP_ENABLED ? (
            <p className="text-center text-xs leading-5 text-slate-500">
              COPPE está actualmente en acceso privado. Las nuevas cuentas se
              activan por invitación o autorización.
            </p>
          ) : null}

          <button
            type="button"
            className="mt-3 w-full text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setActiveView("landing")}
          >
            Volver al inicio
          </button>
        </form>
      </div>
    </div>
  );
}
