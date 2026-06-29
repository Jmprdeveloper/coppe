"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { Button } from "./Button";
import { SectionCard } from "./SectionCard";

type EnrollmentData = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function MfaSettingsCard() {
  const supabase = useMemo(() => createClient(), []);
  const [verifiedFactorId, setVerifiedFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentData | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      setErrorMessage("No se pudo cargar la configuración MFA.");
      setIsLoading(false);
      return;
    }

    setVerifiedFactorId(data?.totp?.[0]?.id ?? "");
    setIsLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!mounted) {
        return;
      }

      if (error) {
        setErrorMessage("No se pudo cargar la configuración MFA.");
        setIsLoading(false);
        return;
      }

      setVerifiedFactorId(data?.totp?.[0]?.id ?? "");
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const handleStartEnrollment = async () => {
    setMessage("");
    setErrorMessage("");
    setIsWorking(true);

    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const unverifiedFactors =
      factorsData?.all.filter(
        (factor) =>
          factor.factor_type === "totp" && factor.status === "unverified"
      ) ?? [];

    for (const factor of unverifiedFactors) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "COPPE",
    });

    setIsWorking(false);

    if (error || !data?.totp) {
      setErrorMessage(
        error?.message || "No se pudo iniciar la configuración MFA."
      );
      return;
    }

    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setVerificationCode("");
  };

  const handleVerifyEnrollment = async () => {
    const cleanCode = verificationCode.replace(/\s+/g, "");

    setMessage("");
    setErrorMessage("");

    if (!enrollment || !/^\d{6}$/.test(cleanCode)) {
      setErrorMessage("Introduce el código de 6 dígitos de la aplicación.");
      return;
    }

    setIsWorking(true);

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: cleanCode,
    });

    setIsWorking(false);

    if (error) {
      setErrorMessage(
        "El código no es válido o ha caducado. Comprueba la hora del dispositivo."
      );
      return;
    }

    setEnrollment(null);
    setVerificationCode("");
    setMessage("Verificación en dos pasos activada correctamente.");
    await loadFactors();
  };

  const handleDisableMfa = async () => {
    setMessage("");
    setErrorMessage("");

    if (
      !verifiedFactorId ||
      !window.confirm(
        "¿Seguro que quieres desactivar la verificación en dos pasos para tu cuenta?"
      )
    ) {
      return;
    }

    setIsWorking(true);

    const { error } = await supabase.auth.mfa.unenroll({
      factorId: verifiedFactorId,
    });

    setIsWorking(false);

    if (error) {
      setErrorMessage(
        "No se pudo desactivar MFA. Cierra sesión, vuelve a verificar el segundo factor e inténtalo otra vez."
      );
      return;
    }

    setVerifiedFactorId("");
    setMessage("Verificación en dos pasos desactivada.");
  };

  return (
    <SectionCard
      title="Seguridad de la cuenta"
      description="Protege tu acceso con una aplicación de autenticación."
      tone="info"
    >
      {isLoading ? (
        <p className="text-sm text-slate-600">Cargando seguridad...</p>
      ) : verifiedFactorId ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="mt-0.5 text-emerald-700" size={20} />
            <div>
              <div className="font-semibold text-emerald-900">MFA activo</div>
              <p className="mt-1 text-sm leading-5 text-emerald-800">
                COPPE solicitará un código después de iniciar sesión.
              </p>
            </div>
          </div>

          <Button
            className="mt-4 w-full"
            variant="secondary"
            onClick={handleDisableMfa}
            disabled={isWorking}
          >
            Desactivar verificación en dos pasos
          </Button>
        </>
      ) : enrollment ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            Escanea el código con tu aplicación de autenticación y confirma el
            código generado.
          </p>

          <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3">
            <Image
              src={enrollment.qrCode}
              alt="Código QR para configurar MFA"
              width={220}
              height={220}
              unoptimized
            />
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">
              Introducir clave manualmente
            </summary>
            <code className="mt-2 block break-all">{enrollment.secret}</code>
          </details>

          <input
            value={verificationCode}
            onChange={(event) => {
              setVerificationCode(
                event.target.value.replace(/\D/g, "").slice(0, 6)
              );
              setErrorMessage("");
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xl font-bold tracking-[0.35em] outline-none focus:border-[#0F4C5C]"
            placeholder="000000"
          />

          <Button
            className="w-full"
            onClick={handleVerifyEnrollment}
            disabled={isWorking}
          >
            Verificar y activar
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 text-[#0F4C5C]" size={20} />
            <p className="text-sm leading-6 text-slate-600">
              Añade una segunda comprobación mediante códigos TOTP.
            </p>
          </div>

          <Button
            className="mt-4 w-full"
            variant="secondary"
            onClick={handleStartEnrollment}
            disabled={isWorking}
          >
            Activar verificación en dos pasos
          </Button>
        </>
      )}

      {errorMessage ? (
        <p className="mt-3 text-sm leading-5 text-red-700">{errorMessage}</p>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm leading-5 text-emerald-700">{message}</p>
      ) : null}
    </SectionCard>
  );
}
