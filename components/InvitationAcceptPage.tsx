"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { Building2, CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "../lib/supabase/client";

import { Button } from "./Button";

type InvitationAcceptPageProps = {
  token: string;
};

type InvitationPreviewRow = {
  company_name: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
};

type AcceptInvitationResult = {
  company_id: string;
  company_name: string;
  role: string;
};

type InvitationRegistrationResponse = {
  ok?: boolean;
  code?: string;
  message?: string;
  error?: string;
  email?: string;
  retryAfterSeconds?: number;
};

type AuthMode = "login" | "register";

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
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (normalizedMessage.includes("signup is disabled")) {
    return "El registro de nuevas cuentas está desactivado en este momento.";
  }

  if (normalizedMessage.includes("email rate limit exceeded")) {
    return "Se han enviado demasiados correos de confirmación. Espera unos minutos antes de intentarlo de nuevo.";
  }

  if (normalizedMessage.includes("unable to validate email address")) {
    return "No se pudo validar el email. Comprueba que la dirección esté bien escrita.";
  }

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("failed to fetch")
  ) {
    return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }

  return message || "Ha ocurrido un error inesperado.";
}

function getInvitationErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invitation not found")) {
    return "No se encontró la invitación.";
  }

  if (normalizedMessage.includes("invitation is not pending")) {
    return "Esta invitación ya no está pendiente.";
  }

  if (normalizedMessage.includes("invitation has expired")) {
    return "Esta invitación ha caducado.";
  }

  if (normalizedMessage.includes("invitation email does not match")) {
    return "Esta invitación pertenece a otro email. Inicia sesión con el email invitado.";
  }

  if (normalizedMessage.includes("user already belongs to a company")) {
    return "Este usuario ya pertenece a una empresa en COPPE.";
  }

  return message || "No se pudo aceptar la invitación.";
}

function getInvitationRegistrationErrorMessage(
  result: InvitationRegistrationResponse | null,
  status: number
) {
  if (result?.message) {
    return result.message;
  }

  if (result?.error) {
    return result.error;
  }

  if (status === 429) {
    return "Se han realizado demasiados intentos. Inténtalo de nuevo dentro de unos minutos.";
  }

  if (status >= 500) {
    return "No se pudo crear la cuenta de invitado. Inténtalo de nuevo en unos minutos.";
  }

  return "No se pudo crear la cuenta de invitado.";
}

async function parseInvitationRegistrationResponse(response: Response) {
  try {
    return (await response.json()) as InvitationRegistrationResponse;
  } catch {
    return null;
  }
}

async function registerInvitedUser(values: {
  token: string;
  email: string;
  fullName: string;
  password: string;
}) {
  const response = await fetch("/api/invitations/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: values.token,
      email: values.email,
      fullName: values.fullName,
      password: values.password,
    }),
  });

  const result = await parseInvitationRegistrationResponse(response);

  if (!response.ok || result?.ok === false) {
    throw new Error(getInvitationRegistrationErrorMessage(result, response.status));
  }

  return result;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusLabel(status: string) {
  if (status === "pending") {
    return "Pendiente";
  }

  if (status === "accepted") {
    return "Aceptada";
  }

  if (status === "cancelled") {
    return "Cancelada";
  }

  if (status === "expired") {
    return "Caducada";
  }

  return "Sin estado";
}

export function InvitationAcceptPage({ token }: InvitationAcceptPageProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [preview, setPreview] = useState<InvitationPreviewRow | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [previewErrorMessage, setPreviewErrorMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authErrorMessage, setAuthErrorMessage] = useState("");
  const [acceptMessage, setAcceptMessage] = useState("");
  const [acceptErrorMessage, setAcceptErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadPreview() {
      setIsLoadingPreview(true);
      setPreviewErrorMessage("");

      const { data, error } = await supabase
        .rpc("get_company_invitation_preview", {
          invitation_token: token,
        })
        .maybeSingle<InvitationPreviewRow>();

      if (!mounted) {
        return;
      }

      if (error) {
        setPreviewErrorMessage(
          `No se pudo cargar la invitación: ${
            error.message || "sin detalle del error"
          }`
        );
        setPreview(null);
        setIsLoadingPreview(false);
        return;
      }

      if (!data) {
        setPreviewErrorMessage("No se encontró ninguna invitación con este enlace.");
        setPreview(null);
        setIsLoadingPreview(false);
        return;
      }

      setPreview(data);
      setEmail(data.email ?? "");
      setIsLoadingPreview(false);
    }

    loadPreview();

    return () => {
      mounted = false;
    };
  }, [supabase, token]);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setUser(data.user);
      setIsLoadingAuth(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    loadUser();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const canAcceptInvitation =
    Boolean(user) && preview?.status === "pending" && !acceptMessage;

  const userEmail = user?.email?.toLowerCase() ?? "";
  const invitedEmail = preview?.email?.toLowerCase() ?? "";
  const loggedUserDoesNotMatchInvitation =
    Boolean(userEmail && invitedEmail && userEmail !== invitedEmail);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setAuthMessage("");
    setAuthErrorMessage("");
    setAcceptMessage("");
    setAcceptErrorMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim();

    if (authMode === "register" && !cleanFullName) {
      setAuthErrorMessage("Introduce tu nombre completo.");
      return;
    }

    if (!cleanEmail) {
      setAuthErrorMessage("Introduce tu email.");
      return;
    }

    if (!password) {
      setAuthErrorMessage("Introduce tu contraseña.");
      return;
    }

    if (preview?.email && cleanEmail !== preview.email.toLowerCase()) {
      setAuthErrorMessage(
        "Debes usar el mismo email al que se envió la invitación."
      );
      return;
    }

    setIsSubmittingAuth(true);

    try {
      if (authMode === "register") {
        await registerInvitedUser({
          token,
          email: cleanEmail,
          fullName: cleanFullName,
          password,
        });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          throw error;
        }

        setUser(data.user);
        setAuthMessage(
          "Cuenta creada correctamente. Ahora puedes aceptar la invitación."
        );
        setPassword("");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        throw error;
      }

      setUser(data.user);
      setPassword("");
    } catch (error) {
      const message =
        error instanceof Error
          ? getAuthErrorMessage(error.message)
          : "Ha ocurrido un error inesperado.";

      setAuthErrorMessage(message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSignOut = async () => {
    setAuthMessage("");
    setAuthErrorMessage("");
    setAcceptMessage("");
    setAcceptErrorMessage("");
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut();

    setIsSigningOut(false);

    if (error) {
      setAcceptErrorMessage(
        getAuthErrorMessage(error.message || "No se pudo cerrar sesión.")
      );
      return;
    }

    setUser(null);
    setAuthMode("login");
    setPassword("");

    if (preview?.email) {
      setEmail(preview.email);
    }
  };

  const handleAcceptInvitation = async () => {
    setAcceptMessage("");
    setAcceptErrorMessage("");
    setAuthMessage("");
    setAuthErrorMessage("");

    if (!user) {
      setAcceptErrorMessage("Inicia sesión para aceptar la invitación.");
      return;
    }

    if (!preview) {
      setAcceptErrorMessage("No se pudo cargar la invitación.");
      return;
    }

    if (preview.status !== "pending") {
      setAcceptErrorMessage("Esta invitación ya no está pendiente.");
      return;
    }

    if (loggedUserDoesNotMatchInvitation) {
      setAcceptErrorMessage(
        "Esta invitación pertenece a otro email. Cierra sesión e inicia sesión con el email invitado."
      );
      return;
    }

    setIsAccepting(true);

    const { data, error } = await supabase
      .rpc("accept_company_invitation", {
        invitation_token: token,
      })
      .maybeSingle<AcceptInvitationResult>();

    setIsAccepting(false);

    if (error || !data) {
      setAcceptErrorMessage(
        getInvitationErrorMessage(error?.message || "No se pudo aceptar la invitación.")
      );
      return;
    }

    setAcceptMessage(
      `Invitación aceptada correctamente. Ya formas parte de ${data.company_name}.`
    );

    window.setTimeout(() => {
      router.push("/");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FA] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
          <div className="bg-[#0F4C5C] px-6 py-7 text-white md:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <Building2 size={22} />
              </div>

              <div>
                <div className="text-sm font-medium text-white/75">
                  Invitación a COPPE
                </div>

                <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                  {preview?.company_name ?? "Espacio de trabajo"}
                </h1>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/80">
              Acepta la invitación para unirte al espacio de trabajo de la
              empresa en COPPE.
            </p>
          </div>

          <div className="space-y-5 p-6 md:p-8">
            {isLoadingPreview || isLoadingAuth ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Cargando invitación...
              </div>
            ) : null}

            {!isLoadingPreview && previewErrorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {previewErrorMessage}
              </div>
            ) : null}

            {!isLoadingPreview && preview ? (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Empresa
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {preview.company_name}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email invitado
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {preview.email}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rol
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {preview.role === "member" ? "Miembro" : preview.role}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estado
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {getStatusLabel(preview.status)}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Caducidad
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {formatDateTime(preview.expires_at)}
                  </div>
                </div>
              </div>
            ) : null}

            {!isLoadingAuth && preview?.status === "pending" && !user ? (
              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setAuthMessage("");
                      setAuthErrorMessage("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      authMode === "login"
                        ? "bg-white text-[#0F4C5C] shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    <LogIn size={15} />
                    Iniciar sesión
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("register");
                      setAuthMessage("");
                      setAuthErrorMessage("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      authMode === "register"
                        ? "bg-white text-[#0F4C5C] shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    <UserPlus size={15} />
                    Crear cuenta
                  </button>
                </div>

                {authMode === "register" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Nombre completo
                    <input
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setAuthMessage("");
                        setAuthErrorMessage("");
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                      placeholder="Introduce tu nombre completo"
                    />
                  </label>
                ) : null}

                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setAuthMessage("");
                      setAuthErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    placeholder="Introduce tu email"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setAuthMessage("");
                      setAuthErrorMessage("");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#0F4C5C]"
                    placeholder="Introduce tu contraseña"
                  />
                </label>

                {authErrorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {authErrorMessage}
                  </div>
                ) : null}

                {authMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {authMessage}
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  type="submit"
                  disabled={isSubmittingAuth}
                >
                  {isSubmittingAuth
                    ? authMode === "register"
                      ? "Creando cuenta..."
                      : "Entrando..."
                    : authMode === "register"
                      ? "Crear cuenta"
                      : "Entrar"}
                </Button>
              </form>
            ) : null}

            {!isLoadingAuth && preview?.status === "pending" && user ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  Sesión iniciada como{" "}
                  <span className="font-semibold text-slate-900">
                    {user.email}
                  </span>
                  .
                </div>

                {authMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {authMessage}
                    </div>
                  </div>
                ) : null}

                {loggedUserDoesNotMatchInvitation ? (
                  <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                    <p>
                      Esta invitación pertenece a {preview.email}. Cierra sesión
                      e inicia sesión con ese email para aceptarla.
                    </p>

                    <Button
                      className="w-full"
                      onClick={handleSignOut}
                      disabled={isSigningOut}
                    >
                      {isSigningOut ? "Cerrando sesión..." : "Cerrar sesión"}
                    </Button>
                  </div>
                ) : null}

                {acceptErrorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {acceptErrorMessage}
                  </div>
                ) : null}

                {acceptMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {acceptMessage}
                    </div>
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  onClick={handleAcceptInvitation}
                  disabled={
                    isAccepting ||
                    !canAcceptInvitation ||
                    loggedUserDoesNotMatchInvitation
                  }
                >
                  {isAccepting ? "Aceptando invitación..." : "Aceptar invitación"}
                </Button>
              </div>
            ) : null}

            {!isLoadingPreview &&
            preview &&
            preview.status !== "pending" ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                Esta invitación está marcada como{" "}
                <span className="font-semibold">
                  {getStatusLabel(preview.status).toLowerCase()}
                </span>
                .
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => router.push("/")}
              className="w-full text-center text-sm font-semibold text-[#0F4C5C] hover:underline"
            >
              Ir a COPPE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
