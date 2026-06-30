"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, Inbox, X } from "lucide-react";

import { createClient } from "../lib/supabase/client";
import { classNames } from "../lib/utils";

type InboundNotification = {
  id: string;
  inquiry_id: string;
  source_channel: string;
  customer_name: string;
  title: string;
  preview: string;
  created_at: string;
  is_read: boolean;
};

type InboundNotificationCenterProps = {
  companyId: string;
  openInquiry: (id: string) => void;
};

function formatRelativeDate(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "Ahora";
  }

  const differenceMinutes = Math.max(
    0,
    Math.round((Date.now() - timestamp) / 60_000),
  );

  if (differenceMinutes < 1) {
    return "Ahora";
  }

  if (differenceMinutes < 60) {
    return `Hace ${differenceMinutes} min`;
  }

  if (differenceMinutes < 24 * 60) {
    return `Hace ${Math.round(differenceMinutes / 60)} h`;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function channelTone(channel: string) {
  if (channel === "WhatsApp") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (channel === "Email") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-cyan-200 bg-cyan-50 text-cyan-700";
}

export function InboundNotificationCenter({
  companyId,
  openInquiry,
}: InboundNotificationCenterProps) {
  const supabase = useMemo(() => createClient(), []);
  const panelRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<InboundNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [toast, setToast] = useState<InboundNotification | null>(null);
  const [desktopPermission, setDesktopPermission] =
    useState<NotificationPermission | "unsupported">(() =>
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    );

  const loadNotifications = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_inbound_notifications", {
      p_company_id: companyId,
      p_limit: 40,
    });

    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message || "No se pudieron cargar los avisos.");
      return;
    }

    setErrorMessage("");
    setNotifications((data ?? []) as InboundNotification[]);
  }, [companyId, supabase]);

  useEffect(() => {
    const loadTimeoutId = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    const channel = supabase
      .channel(`inbound-notifications:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbound_notifications",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as Omit<InboundNotification, "is_read">;
          const notification = { ...row, is_read: false };

          setNotifications((current) => [
            notification,
            ...current.filter((item) => item.id !== notification.id),
          ].slice(0, 40));
          setToast(notification);

          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            new Notification(`Nuevo ${notification.source_channel}`, {
              body: `${notification.customer_name}: ${notification.preview}`,
            });
          }
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeoutId);
      void supabase.removeChannel(channel);
    };
  }, [companyId, loadNotifications, supabase]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  const markRead = async (notificationIds?: string[]) => {
    const ids =
      notificationIds ??
      notifications
        .filter((notification) => !notification.is_read)
        .map((notification) => notification.id);

    if (ids.length === 0) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        ids.includes(notification.id)
          ? { ...notification, is_read: true }
          : notification,
      ),
    );

    const { error } = await supabase.rpc("mark_inbound_notifications_read", {
      p_company_id: companyId,
      p_notification_ids: ids,
    });

    if (error) {
      setErrorMessage(error.message || "No se pudo marcar el aviso.");
      void loadNotifications();
    }
  };

  const handleOpenNotification = (notification: InboundNotification) => {
    void markRead([notification.id]);
    setIsOpen(false);
    setToast(null);
    openInquiry(notification.inquiry_id);
  };

  return (
    <>
      <div ref={panelRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          title="Mensajes recibidos"
          aria-label={`${unreadCount} mensajes sin leer`}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-950"
        >
          <Bell size={18} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>

        {isOpen ? (
          <section className="fixed inset-x-3 top-17 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Mensajes recibidos
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Todos los canales, en tiempo real
                </p>
              </div>

              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markRead()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4C5C] hover:text-[#083640]"
                >
                  <CheckCheck size={15} />
                  Leer todo
                </button>
              ) : null}
            </div>

            {errorMessage ? (
              <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {desktopPermission === "default" ? (
              <button
                type="button"
                onClick={async () => {
                  const permission = await Notification.requestPermission();
                  setDesktopPermission(permission);
                }}
                className="flex w-full items-center justify-center gap-2 border-b border-cyan-100 bg-cyan-50 px-4 py-2.5 text-xs font-semibold text-[#0F4C5C] transition hover:bg-cyan-100"
              >
                <Bell size={14} />
                Activar avisos de escritorio
              </button>
            ) : null}

            <div className="max-h-[65vh] overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Cargando avisos...
                </div>
              ) : null}

              {!isLoading && notifications.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Inbox className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Todo al día
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Aquí aparecerán los nuevos emails, WhatsApp y mensajes web.
                  </p>
                </div>
              ) : null}

              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleOpenNotification(notification)}
                  className={classNames(
                    "block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50",
                    !notification.is_read && "bg-cyan-50/50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={classNames(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        notification.is_read ? "bg-slate-200" : "bg-rose-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {notification.customer_name}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatRelativeDate(notification.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs font-medium text-slate-700">
                        {notification.title}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {notification.preview}
                      </p>
                      <span
                        className={classNames(
                          "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          channelTone(notification.source_channel),
                        )}
                      >
                        {notification.source_channel}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-[70] w-[min(380px,calc(100vw-2.5rem))] rounded-2xl border border-[#A7C9D1] bg-white p-4 shadow-2xl shadow-slate-400/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F4C5C] text-white">
              <Bell size={18} />
            </div>
            <button
              type="button"
              onClick={() => handleOpenNotification(toast)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="text-xs font-bold uppercase tracking-wide text-[#0F4C5C]">
                Nuevo {toast.source_channel}
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-950">
                {toast.customer_name}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                {toast.preview}
              </p>
            </button>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setToast(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
