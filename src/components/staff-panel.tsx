"use client";
/* eslint-disable @next/next/no-img-element -- The QR code is a generated data URL. */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowRight,
  ChefHat,
  CircleCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Plus,
  QrCode,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Wallet,
  X,
} from "lucide-react";
import { browserDb } from "@/lib/browser";
import ThemeToggle from "@/components/theme-toggle";
import {
  money,
  total,
  type OrderItem,
  type Session,
  type StaffData,
  type Table,
} from "@/lib/types";

type Tab = "mesas" | "cocina" | "caja" | "finanzas" | "configuracion";
type CartLine = { productId: string; quantity: number; notes: string };
const nav: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "mesas", label: "Mesas", icon: LayoutDashboard },
  { id: "cocina", label: "Cocina", icon: ChefHat },
  { id: "caja", label: "Caja", icon: ReceiptText },
  { id: "finanzas", label: "Finanzas", icon: Wallet },
  { id: "configuracion", label: "Configuración", icon: Settings2 },
];

export default function StaffPanel() {
  const router = useRouter();
  const [data, setData] = useState<StaffData | null>(null);
  const [tab, setTab] = useState<Tab>("mesas");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showTableQr, setShowTableQr] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderKey, setOrderKey] = useState(crypto.randomUUID());
  const [customerName, setCustomerName] = useState("");

  const load = useCallback(
    async (quiet = false) => {
      const client = browserDb();
      if (!client) {
        setError("Configura Supabase en .env.local.");
        return;
      }
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session) {
        router.replace("/acceso");
        return;
      }
      try {
        const response = await fetch("/api/staff", {
          headers: { authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
        if (!quiet) setError("");
      } catch (cause) {
        if (!quiet)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el panel.",
          );
      }
    },
    [router],
  );
  useEffect(() => {
    const initial = setTimeout(() => load(), 0);
    const timer = setInterval(() => load(true), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const client = browserDb();
    const restaurantId = data?.restaurant?.id;
    if (!client || !restaurantId) return;
    let channel: ReturnType<typeof client.channel> | null = null;
    let active = true;
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (!active || !session) return;
      await client.realtime.setAuth(session.access_token);
      if (!active) return;
      channel = client
        .channel(`restaurant:${restaurantId}`, { config: { private: true } })
        .on("broadcast", { event: "refresh" }, () => load(true))
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) client.removeChannel(channel);
    };
  }, [data?.restaurant?.id, load]);

  async function mutate(input: object, success = "Cambios guardados.") {
    if (busy) return false;
    const client = browserDb();
    if (!client) return false;
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      router.replace("/acceso");
      return false;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(success);
      await load(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await browserDb()?.auth.signOut();
    router.push("/acceso");
  }
  const role = data?.role || "";
  const availableTabs = nav.filter(
    (item) =>
      role === "ADMIN" ||
      (item.id === "mesas" && role === "WAITER") ||
      (item.id === "cocina" && role === "KITCHEN") ||
      (item.id === "caja" && role === "CASHIER") ||
      (item.id === "finanzas" && role === "FINANCE"),
  );
  const currentTab = availableTabs.some((item) => item.id === tab)
    ? tab
    : availableTabs[0]?.id || "mesas";
  const tables = data?.tables || [];
  const sessions = data?.sessions || [];
  const orders = data?.orders || [];
  const items = data?.items || [];
  const products = data?.products || [];
  const payments = data?.payments || [];
  const activeSession = (tableId: string) =>
    sessions.find(
      (s) =>
        s.table_id === tableId && !["CLOSED", "CANCELLED"].includes(s.status),
    );
  const itemsFor = (sessionId: string) =>
    items.filter((i) =>
      orders.some(
        (o) => o.id === i.order_id && o.table_session_id === sessionId,
      ),
    );
  const tableFor = (tableId: string) =>
    tables.find((t) => t.id === tableId)?.name || "Mesa";

  if (!data && !error)
    return (
      <div className="page-message">
        <div className="spinner" />
        Cargando panel…
      </div>
    );
  if (data?.setup)
    return <SetupScreen mutate={mutate} error={error} busy={busy} />;
  if (!data)
    return (
      <div className="page-message">
        <p>{error}</p>
        <button className="button button-primary" onClick={() => load()}>
          Reintentar
        </button>
      </div>
    );

  return (
    <div className="staff-app">
      <aside className="sidebar">
        <div className="brand sidebar-brand">
          mesa<span>viva</span>
          <i>.</i>
        </div>
        <div className="restaurant-identity">
          <span className="eyebrow">RESTAURANTE</span>
          <strong>{data.restaurant?.name}</strong>
        </div>
        <nav aria-label="Panel">
          {availableTabs.map((item) => (
            <button
              key={item.id}
              className={currentTab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>{role}</span>
          <button onClick={logout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </aside>
      <div className="staff-content">
        <header className="staff-topbar">
          <div className="staff-mobile-brand">
            mesa<span>viva</span>
            <i>.</i>
          </div>
          <span>
            {new Intl.DateTimeFormat("es-PE", { dateStyle: "full" }).format(
              new Date(),
            )}
          </span>
          <span className="live-dot">En vivo</span>
          <ThemeToggle />
        </header>
        <nav className="mobile-nav" aria-label="Panel">
          {availableTabs.map((item) => (
            <button
              key={item.id}
              className={currentTab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              <small>{item.label}</small>
            </button>
          ))}
        </nav>
        <main className="dashboard-main">
          {error && (
            <div className="notice error">
              {error}
              <button aria-label="Cerrar" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="notice success">
              {message}
              <button aria-label="Cerrar" onClick={() => setMessage("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {currentTab === "mesas" && (
            <>
              <PageTitle
                eyebrow="SERVICIO EN SALA"
                title="Tus mesas"
                subtitle="Cada mesa, cada pedido, en un mismo lugar."
              />
              <div className="metric-row">
                <Metric label="Mesas" value={tables.length} />
                <Metric
                  label="En servicio"
                  value={
                    tables.filter(
                      (t) => activeSession(t.id)?.status === "IN_SERVICE",
                    ).length
                  }
                />
                <Metric
                  label="Listos para entregar"
                  value={items.filter((i) => i.status === "READY").length}
                />
                <Metric
                  label="Cuentas solicitadas"
                  value={
                    sessions.filter((s) => s.status === "BILL_REQUESTED").length
                  }
                />
              </div>
              <div className="table-grid">
                {tables.map((table) => {
                  const session = activeSession(table.id);
                  const account = session ? itemsFor(session.id) : [];
                  const ready = account.filter(
                    (i) => i.status === "READY",
                  ).length;
                  return (
                    <button
                      className="table-card"
                      key={table.id}
                      onClick={() => {
                        setSelectedTable(table);
                        setShowTableQr(false);
                        setCart([]);
                        setOrderKey(crypto.randomUUID());
                      }}
                    >
                      <div className="table-card-top">
                        <span className="table-icon">
                          {table.name.replace(/\D/g, "").padStart(2, "0")}
                        </span>
                        <StatusBadge
                          status={
                            ready ? "READY" : session?.status || "AVAILABLE"
                          }
                        />
                      </div>
                      <h3>{table.name}</h3>
                      <p>
                        {session
                          ? `${session.customer_name || "Servicio activo"} · ${money(total(account))}`
                          : "Lista para recibir clientes"}
                      </p>
                      <span className="card-action">
                        Abrir mesa <ArrowRight size={16} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {!tables.length && (
                <Empty text="Todavía no tienes mesas. Créala en Configuración." />
              )}
            </>
          )}
          {currentTab === "cocina" && (
            <>
              <PageTitle
                eyebrow="COCINA EN VIVO"
                title="Comandas"
                subtitle="Prepara cada producto y avisa cuando esté listo."
              />
              <div className="kds-grid">
                {(["PENDING", "PREPARING", "READY"] as const).map((status) => (
                  <section className="kds-column" key={status}>
                    <h2>
                      {status === "PENDING"
                        ? "Por preparar"
                        : status === "PREPARING"
                          ? "En preparación"
                          : "Listo para salir"}
                      <span>
                        {items.filter((i) => i.status === status).length}
                      </span>
                    </h2>
                    {items
                      .filter((i) => i.status === status)
                      .map((item) => {
                        const order = orders.find(
                          (o) => o.id === item.order_id,
                        );
                        const session = sessions.find(
                          (s) => s.id === order?.table_session_id,
                        );
                        return (
                          <div className="kds-ticket" key={item.id}>
                            <div className="ticket-top">
                              <strong>
                                {tableFor(session?.table_id || "")}
                              </strong>
                              <span>
                                <Clock3 size={14} />
                                {order ? elapsed(order.created_at) : ""}
                              </span>
                            </div>
                            <small>
                              Pedido #{order?.order_number} · {order?.source}
                            </small>
                            <h3>
                              {item.quantity}× {item.product_name_snapshot}
                            </h3>
                            {item.notes && (
                              <p className="ticket-notes">Nota: {item.notes}</p>
                            )}
                            {status !== "READY" ? (
                              <button
                                disabled={busy}
                                className="button button-dark full"
                                onClick={() =>
                                  mutate(
                                    {
                                      type: "item-status",
                                      itemId: item.id,
                                      status:
                                        status === "PENDING"
                                          ? "PREPARING"
                                          : "READY",
                                    },
                                    "Estado actualizado.",
                                  )
                                }
                              >
                                {status === "PENDING"
                                  ? "Empezar"
                                  : "Marcar listo"}
                                <ArrowRight size={16} />
                              </button>
                            ) : (
                              <div className="ready-note">
                                Esperando entrega por sala
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {!items.some((i) => i.status === status) && (
                      <Empty text="Sin productos aquí." />
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {currentTab === "caja" && (
            <>
              <PageTitle
                eyebrow="CUENTAS Y COBROS"
                title="Caja"
                subtitle="Confirma cada pago antes de cerrar la mesa."
              />
              <div className="account-grid">
                {sessions
                  .filter((s) =>
                    ["BILL_REQUESTED", "PAYMENT_PENDING", "PAID"].includes(
                      s.status,
                    ),
                  )
                  .map((session) => (
                    <PaymentCard
                      key={session.id}
                      session={session}
                      tableName={tableFor(session.table_id)}
                      items={itemsFor(session.id)}
                      busy={busy}
                      mutate={mutate}
                    />
                  ))}
                {!sessions.some((s) =>
                  ["BILL_REQUESTED", "PAYMENT_PENDING", "PAID"].includes(
                    s.status,
                  ),
                ) && (
                  <Empty text="No hay cuentas pendientes en este momento." />
                )}
              </div>
            </>
          )}
          {currentTab === "finanzas" && (
            <>
              <PageTitle
                eyebrow="VENTAS REGISTRADAS"
                title="Finanzas"
                subtitle="Movimientos confirmados por tu equipo."
              />
              <div className="metric-row">
                <Metric
                  label="Ventas de hoy"
                  value={money(
                    payments
                      .filter((p) => sameDay(p.confirmed_at))
                      .reduce((sum, p) => sum + Number(p.amount), 0),
                  )}
                />
                <Metric
                  label="Pagos de hoy"
                  value={payments.filter((p) => sameDay(p.confirmed_at)).length}
                />
                <Metric
                  label="Ticket promedio"
                  value={money(
                    payments.length
                      ? payments.reduce((sum, p) => sum + Number(p.amount), 0) /
                          payments.length
                      : 0,
                  )}
                />
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Mesa</th>
                      <th>Método</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const session = sessions.find(
                        (s) => s.id === payment.table_session_id,
                      );
                      return (
                        <tr key={payment.id}>
                          <td>
                            {new Date(payment.confirmed_at).toLocaleString(
                              "es-PE",
                            )}
                          </td>
                          <td>{tableFor(session?.table_id || "")}</td>
                          <td>{payment.method}</td>
                          <td>
                            <strong>{money(payment.amount)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!payments.length && (
                  <Empty text="Las ventas aparecerán aquí al confirmar un pago." />
                )}
              </div>
            </>
          )}
          {currentTab === "configuracion" && (
            <AdminSettings data={data} busy={busy} mutate={mutate} />
          )}
        </main>
      </div>
      {selectedTable && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setSelectedTable(null)}
        >
          <section
            className="modal table-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selectedTable.name}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelectedTable(null)}
              aria-label="Cerrar"
            >
              <X />
            </button>
            {error && <div className="notice error">{error}</div>}
            <span className="eyebrow">SERVICIO DE MESA</span>
            <h2>{selectedTable.name}</h2>
            <div className="customer-access">
              <strong>Vista del cliente</strong>
              <p>Abre la carta de esta mesa para ver precios, pedidos y cuenta.</p>
              <div className="customer-access-actions">
                <Link
                  className="button button-dark"
                  href={`/r/${data.restaurant?.slug}/t/${selectedTable.qr_token}`}
                  target="_blank"
                >
                  Abrir carta <ArrowRight size={16} />
                </Link>
                <button
                  className="button button-quiet"
                  onClick={() => setShowTableQr((value) => !value)}
                >
                  <QrCode size={16} /> {showTableQr ? "Ocultar QR" : "Mostrar QR"}
                </button>
              </div>
              {showTableQr && (
                <>
                  <QrImage
                    url={customerQrUrl(
                      `/r/${data.restaurant?.slug}/t/${selectedTable.qr_token}`,
                    )}
                  />
                  <QrLocalhostNote />
                </>
              )}
            </div>
            {activeSession(selectedTable.id) && (
              <div className="table-account">
                <StatusBadge
                  status={activeSession(selectedTable.id)?.status || ""}
                />
                <strong>
                  {money(total(itemsFor(activeSession(selectedTable.id)!.id)))}
                </strong>
                <small>
                  {
                    orders.filter(
                      (o) =>
                        o.table_session_id ===
                        activeSession(selectedTable.id)?.id,
                    ).length
                  }{" "}
                  pedidos en esta cuenta
                </small>
              </div>
            )}
            {activeSession(selectedTable.id) &&
              itemsFor(activeSession(selectedTable.id)!.id)
                .filter((i) => i.status === "READY")
                .map((i) => (
                  <div className="ready-delivery" key={i.id}>
                    <span>
                      {i.quantity}× {i.product_name_snapshot} listo
                    </span>
                    <button
                      className="button button-dark"
                      disabled={busy}
                      onClick={() =>
                        mutate(
                          {
                            type: "item-status",
                            itemId: i.id,
                            status: "DELIVERED",
                          },
                          "Producto entregado.",
                        )
                      }
                    >
                      Marcar entregado
                    </button>
                  </div>
                ))}
            {activeSession(selectedTable.id)?.status === "IN_SERVICE" && (
              <button
                className="text-link bill-action"
                disabled={busy}
                onClick={() =>
                  mutate(
                    {
                      type: "request-bill",
                      sessionId: activeSession(selectedTable.id)!.id,
                    },
                    "Cuenta solicitada.",
                  )
                }
              >
                Solicitar cuenta <ArrowRight size={16} />
              </button>
            )}
            {["BILL_REQUESTED", "PAYMENT_PENDING", "PAID"].includes(
              activeSession(selectedTable.id)?.status || "",
            ) ? (
              <p>Esta mesa está en proceso de pago. Atiéndela en Caja.</p>
            ) : (
              <>
                <p>
                  Agrega productos al pedido. Se sumarán a la cuenta actual.
                </p>
                <div className="staff-product-picker">
                  {products
                    .filter((p) => p.active && p.available)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setCart((lines) => {
                            const existing = lines.find(
                              (l) => l.productId === p.id,
                            );
                            return existing
                              ? lines.map((l) =>
                                  l.productId === p.id
                                    ? { ...l, quantity: l.quantity + 1 }
                                    : l,
                                )
                              : [
                                  ...lines,
                                  { productId: p.id, quantity: 1, notes: "" },
                                ];
                          });
                          setOrderKey(crypto.randomUUID());
                        }}
                      >
                        <span>
                          {p.name}
                          <small>{money(p.price)}</small>
                        </span>
                        <Plus size={18} />
                      </button>
                    ))}
                </div>
                {cart.length > 0 && (
                  <>
                    <div className="cart-lines">
                      {cart.map((line) => {
                        const p = products.find(
                          (product) => product.id === line.productId,
                        );
                        return (
                          <div className="cart-line" key={line.productId}>
                            <b>
                              {line.quantity}× {p?.name}
                            </b>
                            <strong>
                              {money(Number(p?.price || 0) * line.quantity)}
                            </strong>
                            <button
                              aria-label="Quitar"
                              onClick={() => {
                                setCart((lines) =>
                                  lines.filter(
                                    (l) => l.productId !== line.productId,
                                  ),
                                );
                                setOrderKey(crypto.randomUUID());
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <label className="field-label" htmlFor="waiter-name">
                      Nombre del cliente (opcional)
                    </label>
                    <input
                      className="input"
                      id="waiter-name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                    />
                    <button
                      className="button button-primary full"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await mutate(
                          {
                            type: "order",
                            token: selectedTable.qr_token,
                            customerName,
                            idempotencyKey: orderKey,
                            items: cart,
                          },
                          "Pedido enviado a cocina.",
                        );
                        if (ok) {
                          setCart([]);
                          setOrderKey(crypto.randomUUID());
                          setSelectedTable(null);
                        }
                      }}
                    >
                      Enviar pedido ·{" "}
                      {money(
                        cart.reduce(
                          (sum, l) =>
                            sum +
                            Number(
                              products.find((p) => p.id === l.productId)
                                ?.price || 0,
                            ) *
                              l.quantity,
                          0,
                        ),
                      )}
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SetupScreen({
  mutate,
  error,
  busy,
}: {
  mutate: (input: object, success?: string) => Promise<boolean>;
  error: string;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <main className="setup-page">
      <div className="setup-header">
        <div className="brand">
          mesa<span>viva</span>
          <i>.</i>
        </div>
        <ThemeToggle />
      </div>
      <form
        className="setup-card"
        onSubmit={(event) => {
          event.preventDefault();
          mutate({ type: "setup", name, slug });
        }}
      >
        <span className="eyebrow">PRIMER PASO</span>
        <h1>
          Hagamos espacio
          <br />
          <em>para tu restaurante.</em>
        </h1>
        <p>Configura el nombre que verán tus clientes al escanear el QR.</p>
        <label className="field-label" htmlFor="restaurant-name">
          Nombre del restaurante
        </label>
        <input
          className="input"
          id="restaurant-name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSlug(slugify(event.target.value));
          }}
        />
        <label className="field-label" htmlFor="restaurant-slug">
          Enlace corto
        </label>
        <input
          className="input"
          id="restaurant-slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
        {error && <div className="notice error">{error}</div>}
        <button className="button button-primary full" disabled={busy}>
          Crear restaurante <ArrowRight size={18} />
        </button>
      </form>
    </main>
  );
}

function AdminSettings({
  data,
  busy,
  mutate,
}: {
  data: StaffData;
  busy: boolean;
  mutate: (input: object, success?: string) => Promise<boolean>;
}) {
  const [tableName, setTableName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("WAITER");
  const [product, setProduct] = useState({
    name: "",
    description: "",
    categoryId: "",
    price: "",
    imageUrl: "",
    allergens: "",
  });
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const categories = data.categories || [];
  const products = data.products || [];
  return (
    <>
      <PageTitle
        eyebrow="TU RESTAURANTE"
        title="Configuración"
        subtitle="Prepara tus mesas y el menú que verán tus clientes."
      />
      <div className="settings-grid">
        <section className="settings-card">
          <div className="card-heading">
            <QrCode />
            <div>
              <h2>Mesas y códigos QR</h2>
              <p>Cada mesa obtiene un enlace único.</p>
            </div>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await mutate({ type: "table", name: tableName }, "Mesa creada.")
              )
                setTableName("");
            }}
            className="inline-form"
          >
            <input
              className="input"
              placeholder="Ej. Mesa 08"
              required
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
            />
            <button className="button button-dark" disabled={busy}>
              <Plus size={18} />
              Crear
            </button>
          </form>
          <div className="settings-list">
            {data.tables?.map((table) => (
              <div key={table.id}>
                <strong>{table.name}</strong>
                <button className="text-link" onClick={() => setQrTable(table)}>
                  Ver QR <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <div className="card-heading">
            <ShoppingBag />
            <div>
              <h2>Categorías</h2>
              <p>Organiza los productos del menú.</p>
            </div>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await mutate(
                  { type: "category", name: categoryName },
                  "Categoría creada.",
                )
              )
                setCategoryName("");
            }}
            className="inline-form"
          >
            <input
              className="input"
              placeholder="Ej. Platos principales"
              required
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <button className="button button-dark" disabled={busy}>
              <Plus size={18} />
              Crear
            </button>
          </form>
          <div className="settings-list">
            {categories.map((cat) => (
              <div key={cat.id}>
                <strong>{cat.name}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card wide">
          <div className="card-heading">
            <ChefHat />
            <div>
              <h2>Productos</h2>
              <p>Precios y disponibilidad visibles al instante en el menú.</p>
            </div>
          </div>
          <form
            className="product-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await mutate(
                  { type: "product", ...product, price: Number(product.price) },
                  "Producto agregado.",
                )
              )
                setProduct({
                  name: "",
                  description: "",
                  categoryId: "",
                  price: "",
                  imageUrl: "",
                  allergens: "",
                });
            }}
          >
            <input
              className="input"
              placeholder="Nombre"
              required
              value={product.name}
              onChange={(e) => setProduct({ ...product, name: e.target.value })}
            />
            <select
              className="input"
              required
              value={product.categoryId}
              onChange={(e) =>
                setProduct({ ...product, categoryId: e.target.value })
              }
            >
              <option value="">Categoría</option>
              {categories.map((cat) => (
                <option value={cat.id} key={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio S/"
              required
              value={product.price}
              onChange={(e) =>
                setProduct({ ...product, price: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Descripción"
              value={product.description}
              onChange={(e) =>
                setProduct({ ...product, description: e.target.value })
              }
            />
            <input
              className="input"
              type="url"
              placeholder="URL de imagen (opcional)"
              value={product.imageUrl}
              onChange={(e) =>
                setProduct({ ...product, imageUrl: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Alérgenos (opcional)"
              value={product.allergens}
              onChange={(e) =>
                setProduct({ ...product, allergens: e.target.value })
              }
            />
            <button
              className="button button-primary"
              disabled={busy || !categories.length}
            >
              <Plus size={18} />
              Agregar producto
            </button>
          </form>
          <div className="settings-list">
            {products.map((p) => (
              <div key={p.id}>
                <strong>
                  {p.name}
                  <small>
                    {money(p.price)} ·{" "}
                    {categories.find((c) => c.id === p.category_id)?.name}
                  </small>
                </strong>
                <button
                  className={
                    p.available ? "availability available" : "availability"
                  }
                  onClick={() =>
                    mutate(
                      {
                        type: "availability",
                        productId: p.id,
                        available: !p.available,
                      },
                      "Disponibilidad actualizada.",
                    )
                  }
                >
                  {p.available ? "Disponible" : "Agotado"}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card wide">
          <div className="card-heading">
            <Settings2 />
            <div>
              <h2>Equipo</h2>
              <p>
                La persona debe crear una cuenta con su correo antes de
                asignarle un rol.
              </p>
            </div>
          </div>
          <form
            className="inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await mutate(
                  { type: "add-member", email: memberEmail, role: memberRole },
                  "Miembro agregado al equipo.",
                )
              )
                setMemberEmail("");
            }}
          >
            <input
              className="input"
              type="email"
              required
              placeholder="correo@ejemplo.com"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
            />
            <select
              className="input"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
            >
              <option value="WAITER">Sala</option>
              <option value="KITCHEN">Cocina</option>
              <option value="CASHIER">Caja</option>
              <option value="FINANCE">Finanzas</option>
              <option value="ADMIN">Administración</option>
            </select>
            <button className="button button-dark" disabled={busy}>
              Agregar
            </button>
          </form>
        </section>
      </div>
      {qrTable && (
        <div className="modal-backdrop" onMouseDown={() => setQrTable(null)}>
          <section
            className="modal qr-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`QR de ${qrTable.name}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setQrTable(null)}
              aria-label="Cerrar"
            >
              <X />
            </button>
            <span className="eyebrow">LISTO PARA IMPRIMIR</span>
            <h2>{qrTable.name}</h2>
            <QrImage
              url={customerQrUrl(
                `/r/${data.restaurant?.slug}/t/${qrTable.qr_token}`,
              )}
            />
            <p>Coloca este código en la mesa para abrir el menú.</p>
            <QrLocalhostNote />
            <Link
              className="text-link"
              href={`/r/${data.restaurant?.slug}/t/${qrTable.qr_token}`}
              target="_blank"
            >
              Abrir menú <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      )}
    </>
  );
}

function QrImage({ url }: { url: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 2 }).then(setImage);
  }, [url]);
  return image ? (
    <img className="qr-image" src={image} alt={`Código QR para ${url}`} />
  ) : (
    <div className="spinner" />
  );
}

function customerQrUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  return new URL(path, base).toString();
}

function QrLocalhostNote() {
  if (
    process.env.NEXT_PUBLIC_APP_URL ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  )
    return null;
  return (
    <small className="qr-local-note">
      Este QR usa localhost. Para abrirlo desde un celular, accede a la app por
      una dirección de red o configura NEXT_PUBLIC_APP_URL con una URL pública.
    </small>
  );
}

function PaymentCard({
  session,
  tableName,
  items,
  busy,
  mutate,
}: {
  session: Session;
  tableName: string;
  items: OrderItem[];
  busy: boolean;
  mutate: (input: object, success?: string) => Promise<boolean>;
}) {
  const [method, setMethod] = useState("PHYSICAL_POS");
  return (
    <article className="payment-card">
      <div className="payment-head">
        <div>
          <span className="eyebrow">{tableName.toUpperCase()}</span>
          <h2>{money(total(items))}</h2>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <p>
        {items.length} productos · {session.customer_name || "Cliente de mesa"}
      </p>
      {session.status === "BILL_REQUESTED" && (
        <button
          className="button button-dark full"
          disabled={busy}
          onClick={() =>
            mutate(
              { type: "payment-pending", sessionId: session.id },
              "Pago en proceso.",
            )
          }
        >
          Atender solicitud <ArrowRight size={16} />
        </button>
      )}
      {session.status === "PAYMENT_PENDING" && (
        <>
          <label className="field-label" htmlFor={`method-${session.id}`}>
            Método de pago
          </label>
          <select
            className="input"
            id={`method-${session.id}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="PHYSICAL_POS">POS físico</option>
            <option value="CASH">Efectivo</option>
            <option value="YAPE">Yape</option>
            <option value="PLIN">Plin</option>
            <option value="OTHER">Otro</option>
          </select>
          <button
            className="button button-primary full"
            disabled={busy}
            onClick={() =>
              mutate(
                { type: "payment", sessionId: session.id, method },
                "Pago confirmado y venta registrada.",
              )
            }
          >
            Confirmar pago <CircleCheck size={17} />
          </button>
        </>
      )}
      {session.status === "PAID" && (
        <button
          className="button button-dark full"
          disabled={busy}
          onClick={() =>
            mutate(
              { type: "close", sessionId: session.id },
              "Mesa cerrada y disponible.",
            )
          }
        >
          Cerrar mesa <ArrowRight size={16} />
        </button>
      )}
    </article>
  );
}

function PageTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>
        {title}
        <i>.</i>
      </h1>
      <p>{subtitle}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    AVAILABLE: "Disponible",
    OPEN: "Abierta",
    IN_SERVICE: "En servicio",
    BILL_REQUESTED: "Pide cuenta",
    PAYMENT_PENDING: "Por cobrar",
    PAID: "Pagada",
    READY: "Pedido listo",
  };
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {label[status] || status}
    </span>
  );
}
function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function sameDay(date: string) {
  return new Date(date).toDateString() === new Date().toDateString();
}
function elapsed(date: string) {
  return `${Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))} min`;
}
