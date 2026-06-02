"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { Building2, LogOut, Search, UserRound, X } from "lucide-react";

import { normalizeInquiryStatus } from "../lib/inquiryUtils";
import { normalizeSearchText } from "../lib/searchUtils";
import { createClient } from "../lib/supabase/client";

type NavigationItem = {
  key: string;
  label: string;
  icon: ElementType;
};

type Company = {
  name: string;
};

type TopbarProps = {
  activeView: string;
  setActiveView: (view: string) => void;
  navigation: NavigationItem[];
  company: Company;
  userEmail: string | null;
  onSignOut: () => void;
  openInquiry: (id: string) => void;
  openCustomer: (id: string) => void;
};

type CustomerSearchRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
};

type InquirySearchRow = {
  id: string;
  customer_name: string;
  subject: string | null;
  ai_summary: string | null;
  original_message: string;
  status: string;
};

type FollowUpSearchRow = {
  id: string;
  title: string;
  inquiry_id: string | null;
  customer: {
    name: string | null;
  } | null;
};

type SearchResult = {
  id: string;
  type: "customer" | "inquiry" | "follow_up";
  title: string;
  description: string;
  inquiryId?: string | null;
};

const SEARCH_FETCH_LIMIT = 100;
const SEARCH_RESULTS_PER_TYPE = 4;
const SEARCH_DEBOUNCE_MS = 400;

function getCurrentViewLabel(
  activeView: string,
  navigation: NavigationItem[]
) {
  const navigationLabel = navigation.find(
    (navigationItem) => navigationItem.key === activeView
  )?.label;

  if (navigationLabel) {
    return navigationLabel;
  }

  const detailLabels: Record<string, string> = {
    inquiryDetail: "Detalle de caso",
    customerDetail: "Detalle de cliente",
    InquiryForm: "Registrar mensaje",
  };

  return detailLabels[activeView] ?? "COPPE";
}

function resultTypeLabel(type: SearchResult["type"]) {
  if (type === "customer") {
    return "Cliente";
  }

  if (type === "inquiry") {
    return "Caso";
  }

  return "Seguimiento";
}

function customerStatusLabel(status: string) {
  if (status === "new") {
    return "Nuevo";
  }

  if (status === "active") {
    return "Activo";
  }

  if (status === "inactive") {
    return "Inactivo";
  }

  if (status === "archived") {
    return "Archivado";
  }

  return "Estado no indicado";
}

function inquiryStatusLabel(status: string) {
  const normalizedStatus = normalizeInquiryStatus(status);

  if (normalizedStatus === "new") {
    return "Nuevo";
  }

  if (normalizedStatus === "pending") {
    return "En seguimiento";
  }

  if (normalizedStatus === "waiting_customer") {
    return "Esperando al cliente";
  }

  if (normalizedStatus === "replied") {
    return "Respondido";
  }

  if (normalizedStatus === "closed") {
    return "Cerrado";
  }

  if (normalizedStatus === "discarded") {
    return "Descartado";
  }

  return "Estado no indicado";
}

export function Topbar({
  activeView,
  setActiveView,
  navigation,
  company,
  userEmail,
  onSignOut,
  openInquiry,
  openCustomer,
}: TopbarProps) {
  const supabase = useMemo(() => createClient(), []);
  const current = getCurrentViewLabel(activeView, navigation);

  const searchRequestId = useRef(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchErrorMessage, setSearchErrorMessage] = useState("");

  const clearSearch = () => {
    searchRequestId.current += 1;
    setSearchTerm("");
    setResults([]);
    setIsSearching(false);
    setHasSearched(false);
    setSearchErrorMessage("");
  };

  const handleSearch = useCallback(
    async (
      searchValue: string,
      options: { showShortSearchError?: boolean } = {}
    ) => {
      const cleanSearch = searchValue.trim();
      const normalizedSearch = normalizeSearchText(cleanSearch);
      const currentRequestId = searchRequestId.current + 1;

      searchRequestId.current = currentRequestId;

      setSearchErrorMessage("");
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);

      if (!normalizedSearch) {
        return;
      }

      if (normalizedSearch.length < 2) {
        if (options.showShortSearchError) {
          setSearchErrorMessage("Escribe al menos 2 caracteres.");
          setHasSearched(true);
        }

        return;
      }

      setIsSearching(true);

      try {
        const [customersResponse, inquiriesResponse, followUpsResponse] =
          await Promise.all([
            supabase
              .from("customers")
              .select("id, name, email, phone, status")
              .limit(SEARCH_FETCH_LIMIT),

            supabase
              .from("inquiries")
              .select(
                "id, customer_name, subject, ai_summary, original_message, status"
              )
              .limit(SEARCH_FETCH_LIMIT),

            supabase
              .from("follow_ups")
              .select("id, title, inquiry_id, customer:customers(name)")
              .eq("status", "pending")
              .limit(SEARCH_FETCH_LIMIT),
          ]);

        if (searchRequestId.current !== currentRequestId) {
          return;
        }

        setHasSearched(true);

        if (customersResponse.error) {
          setSearchErrorMessage(
            `No se pudieron buscar clientes: ${
              customersResponse.error.message || "sin detalle del error"
            }`
          );
          return;
        }

        if (inquiriesResponse.error) {
          setSearchErrorMessage(
            `No se pudieron buscar casos: ${
              inquiriesResponse.error.message || "sin detalle del error"
            }`
          );
          return;
        }

        if (followUpsResponse.error) {
          setSearchErrorMessage(
            `No se pudieron buscar seguimientos: ${
              followUpsResponse.error.message || "sin detalle del error"
            }`
          );
          return;
        }

        const customers = (customersResponse.data ??
          []) as unknown as CustomerSearchRow[];

        const inquiries = (inquiriesResponse.data ??
          []) as unknown as InquirySearchRow[];

        const followUps = (followUpsResponse.data ??
          []) as unknown as FollowUpSearchRow[];

        const customerResults: SearchResult[] = customers
          .filter((customer) => {
            return (
              normalizeSearchText(customer.name).includes(normalizedSearch) ||
              normalizeSearchText(customer.email).includes(normalizedSearch) ||
              normalizeSearchText(customer.phone).includes(normalizedSearch)
            );
          })
          .slice(0, SEARCH_RESULTS_PER_TYPE)
          .map((customer) => {
            const contact =
              customer.email || customer.phone || "Cliente sin contacto";

            return {
              id: customer.id,
              type: "customer",
              title: customer.name,
              description: `${contact} · ${customerStatusLabel(
                customer.status
              )}`,
            };
          });

        const inquiryResults: SearchResult[] = inquiries
          .filter((inquiry) => {
            return (
              normalizeSearchText(inquiry.customer_name).includes(
                normalizedSearch
              ) ||
              normalizeSearchText(inquiry.subject).includes(normalizedSearch) ||
              normalizeSearchText(inquiry.ai_summary).includes(
                normalizedSearch
              ) ||
              normalizeSearchText(inquiry.original_message).includes(
                normalizedSearch
              )
            );
          })
          .slice(0, SEARCH_RESULTS_PER_TYPE)
          .map((inquiry) => ({
            id: inquiry.id,
            type: "inquiry",
            title: inquiry.subject || `Caso de ${inquiry.customer_name}`,
            description: `Caso · ${
              inquiry.customer_name
            } · ${inquiryStatusLabel(inquiry.status)}`,
          }));

        const followUpResults: SearchResult[] = followUps
          .filter((followUp) => {
            return (
              normalizeSearchText(followUp.title).includes(normalizedSearch) ||
              normalizeSearchText(followUp.customer?.name).includes(
                normalizedSearch
              )
            );
          })
          .slice(0, SEARCH_RESULTS_PER_TYPE)
          .map((followUp) => ({
            id: followUp.id,
            type: "follow_up",
            title: followUp.title,
            description: `Seguimiento · ${
              followUp.customer?.name || "Cliente no indicado"
            }`,
            inquiryId: followUp.inquiry_id,
          }));

        setResults([...customerResults, ...inquiryResults, ...followUpResults]);
      } catch (error) {
        if (searchRequestId.current !== currentRequestId) {
          return;
        }

        setHasSearched(true);
        setSearchErrorMessage(
          error instanceof Error
            ? `No se pudo completar la búsqueda: ${error.message}`
            : "No se pudo completar la búsqueda."
        );
      } finally {
        if (searchRequestId.current === currentRequestId) {
          setIsSearching(false);
        }
      }
    },
    [supabase]
  );

  useEffect(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    if (!normalizedSearch || normalizedSearch.length < 2) {
      searchRequestId.current += 1;
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      setSearchErrorMessage("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      handleSearch(searchTerm);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [handleSearch, searchTerm]);

  const handleOpenResult = (result: SearchResult) => {
    clearSearch();

    if (result.type === "customer") {
      openCustomer(result.id);
      return;
    }

    if (result.type === "inquiry") {
      openInquiry(result.id);
      return;
    }

    if (result.type === "follow_up" && result.inquiryId) {
      openInquiry(result.inquiryId);
      return;
    }

    setSearchErrorMessage("Este seguimiento no tiene un caso asociado.");
  };

  const showSearchPanel =
    hasSearched || isSearching || searchErrorMessage || results.length > 0;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => setActiveView("dashboard")}
        title="Ir al dashboard"
        className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0F4C5C] text-white lg:hidden"
        >
        <Building2 size={18} />
      </button>

        <div>
          <div className="text-sm font-semibold text-slate-950">
            {company.name}
          </div>
          <div className="text-xs text-slate-500">{current}</div>
        </div>
      </div>

      <div className="relative hidden w-full max-w-md md:block">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={16} className="shrink-0 text-slate-400" />

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch(searchTerm, { showShortSearchError: true });
              }

              if (event.key === "Escape") {
                clearSearch();
              }
            }}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Buscar casos, clientes o seguimientos..."
          />

          {searchTerm ? (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              title="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() =>
              handleSearch(searchTerm, { showShortSearchError: true })
            }
            disabled={isSearching}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            title="Buscar"
          >
            <Search size={15} />
          </button>
        </div>

        {showSearchPanel ? (
          <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
            {isSearching ? (
              <div className="px-4 py-3 text-sm text-slate-500">
                Buscando...
              </div>
            ) : null}

            {searchErrorMessage ? (
              <div className="px-4 py-3 text-sm text-red-600">
                {searchErrorMessage}
              </div>
            ) : null}

            {!isSearching &&
            !searchErrorMessage &&
            hasSearched &&
            results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-500">
                No se encontraron resultados.
              </div>
            ) : null}

            {!isSearching && !searchErrorMessage && results.length > 0 ? (
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => handleOpenResult(result)}
                    className="block w-full px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          {result.title}
                        </div>

                        <div className="mt-1 truncate text-xs text-slate-500">
                          {result.description}
                        </div>
                      </div>

                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {resultTypeLabel(result.type)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {userEmail ? (
          <div className="hidden max-w-[190px] truncate text-right text-xs text-slate-500 xl:block">
            {userEmail}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSignOut}
          title="Cerrar sesión"
          className="flex h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-slate-700 transition hover:bg-slate-200 hover:text-slate-950"
        >
          <UserRound size={17} />
          <span className="hidden text-sm font-medium md:inline">Salir</span>
          <LogOut size={15} className="hidden md:block" />
        </button>
      </div>
    </header>
  );
}