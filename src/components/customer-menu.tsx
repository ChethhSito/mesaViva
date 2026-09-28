"use client";
/* eslint-disable @next/next/no-img-element -- Restaurant-provided image URLs are displayed without an image proxy. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  WifiOff,
  X,
} from "lucide-react";
import { money, total, type Product, type PublicData } from "@/lib/types";
import ThemeToggle from "@/components/theme-toggle";
import { browserDb } from "@/lib/browser";

type CartLine = { productId: string; quantity: number; notes: string };
const keyFor = (slug: string, token: string) =>
  `mesa-viva-cart:${slug}:${token}`;

export default function CustomerMenu({
  slug,
  token,
}: {
  slug: string;
  token: string;
}) {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<"cart" | "bill" | null>(null);
  const [name, setName] = useState("");
  const [success, setSuccess] = useState("");
  const [requestKey, setRequestKey] = useState<string | null>(null);

  const refresh = useCallback(
    async (quiet = false) => {
      try {
        const response = await fetch(
          `/api/public?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "No se pudo cargar el menú.");
        setData(result);
        setError("");
      } catch (cause) {
        if (!quiet)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el menú.",
          );
      }
    },
    [slug, token],
  );

  useEffect(() => {
    const initial = setTimeout(() => {
      try {
        const saved = localStorage.getItem(keyFor(slug, token));
        if (saved) setCart(JSON.parse(saved));
      } catch {
        /* ignore corrupted cart */
      }
      setCartReady(true);
      setOffline(!navigator.onLine);
      refresh();
    }, 0);
    const online = () => {
      setOffline(false);
      refresh(true);
    };
    const down = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", down);
    const timer = setInterval(() => {
      if (navigator.onLine) refresh(true);
    }, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", down);
    };
  }, [refresh, slug, token]);
  useEffect(() => {
    if (cartReady)
      localStorage.setItem(keyFor(slug, token), JSON.stringify(cart));
  }, [cart, cartReady, slug, token]);
  useEffect(() => {
    const client = browserDb();
    if (!client || !data?.restaurant.id) return;
    const onRefresh = () => refresh(true);
    const tableChannel = client
      .channel(`table:${token}`)
      .on("broadcast", { event: "refresh" }, onRefresh)
      .subscribe();
    const menuChannel = client
      .channel(`menu:${data.restaurant.id}`)
      .on("broadcast", { event: "refresh" }, onRefresh)
      .subscribe();
    return () => {
      client.removeChannel(tableChannel);
      client.removeChannel(menuChannel);
    };
  }, [data?.restaurant.id, refresh, token]);

  const products = data?.products || [];
  const filtered = products.filter(
    (p) =>
      (category === "all" || p.category_id === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) =>
      sum +
      Number(products.find((p) => p.id === item.productId)?.price || 0) *
        item.quantity,
    0,
  );
  const sessionItems = useMemo(
    () =>
      data?.items.filter((i) => data.orders.some((o) => o.id === i.order_id)) ||
      [],
    [data],
  );
  const sessionTotal = total(sessionItems);
  const canOrder =
    !data?.session || ["OPEN", "IN_SERVICE"].includes(data.session.status);

  function addSelected() {
    if (!selected) return;
    setRequestKey(null);
    setCart((lines) => {
      const index = lines.findIndex(
        (line) => line.productId === selected.id && line.notes === notes.trim(),
      );
      if (index < 0)
        return [
          ...lines,
          { productId: selected.id, quantity, notes: notes.trim() },
        ];
      return lines.map((line, i) =>
        i === index
          ? { ...line, quantity: Math.min(99, line.quantity + quantity) }
          : line,
      );
    });
    setSelected(null);
    setNotes("");
    setQuantity(1);
  }

  async function sendOrder() {
    if (!cart.length || busy || offline) return;
    const idempotencyKey = requestKey || crypto.randomUUID();
    setRequestKey(idempotencyKey);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "order",
          slug,
          token,
          customerName: name,
          idempotencyKey,
          items: cart,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCart([]);
      setRequestKey(null);
      setPanel(null);
      setSuccess("¡Pedido enviado! La cocina ya lo recibió.");
      await refresh(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No pudimos enviar el pedido.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestBill() {
    if (busy || offline) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "bill", slug, token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPanel(null);
      setSuccess(
        "Cuenta solicitada. Un miembro del equipo se acercará pronto.",
      );
      await refresh(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos solicitar la cuenta.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error)
    return (
      <div className="page-message">
        <div className="spinner" />
        Cargando menú…
      </div>
    );
  if (!data)
    return (
      <div className="page-message">
        <UtensilsCrossed size={32} />
        <h1>No encontramos esta mesa</h1>
        <p>{error}</p>
        <button className="button button-primary" onClick={() => refresh()}>
          Reintentar
        </button>
      </div>
    );

  return (
    <div className="customer-app">
      {offline && (
        <div className="connection-banner">
          <WifiOff size={16} /> Sin conexión. Tu carrito está guardado.
        </div>
      )}
      <header className="customer-header">
        <div className="customer-logo">
          mesa<span>viva</span>
          <i>.</i>
        </div>
        <div className="header-actions">
          <div className="table-pill">{data.table.name}</div>
          <ThemeToggle />
        </div>
      </header>
      <section className="menu-hero">
        <div className="eyebrow">
          {data.restaurant.name.toUpperCase()} · {data.table.name.toUpperCase()}
        </div>
        <h1>
          Hecho para
          <br />
          <em>disfrutar.</em>
        </h1>
        <p>Explora el menú, elige tus favoritos y pide sin esperar.</p>
        <div className="hero-decoration">✳</div>
      </section>
      <main className="menu-main">
        {success && (
          <div className="notice success">
            <Check size={18} />
            {success}
            <button aria-label="Cerrar aviso" onClick={() => setSuccess("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {error && (
          <div className="notice error">
            {error}
            <button aria-label="Cerrar error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {data.session && (
          <section className="account-summary">
            <div>
              <span className="eyebrow">TU MESA EN VIVO</span>
              <h2>
                Tu cuenta <span>{money(sessionTotal)}</span>
              </h2>
              <p>
                {data.session.status === "BILL_REQUESTED" ||
                data.session.status === "PAYMENT_PENDING"
                  ? "Cuenta solicitada · pronto te atenderán"
                  : data.session.status === "PAID"
                    ? "Pago confirmado · gracias por visitarnos"
                    : `${data.orders.length} pedido${data.orders.length === 1 ? "" : "s"} en esta visita`}
              </p>
            </div>
            <div className="status-list">
              {sessionItems.map((item) => (
                <span key={item.id}>
                  {item.quantity}× {item.product_name_snapshot}{" "}
                  · {money(Number(item.unit_price) * item.quantity)}{" "}
                  <b>{labelStatus(item.status)}</b>
                </span>
              ))}
            </div>
            {["OPEN", "IN_SERVICE"].includes(data.session.status) && (
              <button className="text-link" onClick={() => setPanel("bill")}>
                Pedir la cuenta <ArrowRight size={16} />
              </button>
            )}
          </section>
        )}
        <div className="section-heading">
          <div>
            <span className="eyebrow">NUESTRO MENÚ</span>
            <h2>Algo rico te espera.</h2>
          </div>
          <span>{products.length} opciones</span>
        </div>
        <label className="search-field">
          <Search size={19} />
          <input
            aria-label="Buscar platos"
            placeholder="Buscar platos, bebidas…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav className="category-tabs" aria-label="Categorías">
          <button
            className={category === "all" ? "active" : ""}
            onClick={() => setCategory("all")}
          >
            Todo
          </button>
          {data.categories.map((cat) => (
            <button
              key={cat.id}
              className={category === cat.id ? "active" : ""}
              onClick={() => setCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </nav>
        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    <div className="image-placeholder">
                      <UtensilsCrossed size={42} />
                    </div>
                  )}
                  {!product.available && (
                    <span className="sold-out">Agotado</span>
                  )}
                </div>
                <div className="product-info">
                  <h3>{product.name}</h3>
                  <p>{product.description || "Preparado con mucho cuidado."}</p>
                  {product.allergens && (
                    <small>Alérgenos: {product.allergens}</small>
                  )}
                  <div className="product-bottom">
                    <strong>{money(product.price)}</strong>
                    <button
                      aria-label={`Agregar ${product.name}`}
                      disabled={!product.available || !canOrder}
                      onClick={() => {
                        setSelected(product);
                        setQuantity(1);
                        setNotes("");
                      }}
                    >
                      <Plus size={22} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No hay productos que coincidan con tu búsqueda.
          </div>
        )}
      </main>
      {cartCount > 0 && canOrder && (
        <button className="sticky-cart" onClick={() => setPanel("cart")}>
          <span>
            <ShoppingBag size={20} />
            <b>
              {cartCount} {cartCount === 1 ? "producto" : "productos"}
            </b>
            <small>{money(cartTotal)}</small>
          </span>
          <span>
            Ver pedido <ArrowRight size={18} />
          </span>
        </button>
      )}
      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="modal product-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Agregar ${selected.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              <X />
            </button>
            <span className="eyebrow">A TU GUSTO</span>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
            <strong className="modal-price">{money(selected.price)}</strong>
            <label className="field-label">Cantidad</label>
            <div className="quantity-control">
              <button
                aria-label="Reducir cantidad"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus />
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Aumentar cantidad"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              >
                <Plus />
              </button>
            </div>
            <label className="field-label" htmlFor="customer-notes">
              Indicaciones especiales
            </label>
            <textarea
              id="customer-notes"
              placeholder="Por ejemplo: sin cebolla"
              maxLength={300}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <button
              className="button button-primary full"
              onClick={addSelected}
            >
              Agregar · {money(Number(selected.price) * quantity)}{" "}
              <ArrowRight size={18} />
            </button>
          </section>
        </div>
      )}
      {panel && (
        <div className="modal-backdrop" onMouseDown={() => setPanel(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={panel === "cart" ? "Tu pedido" : "Solicitar cuenta"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              onClick={() => setPanel(null)}
              aria-label="Cerrar"
            >
              <X />
            </button>
            {error && <div className="notice error">{error}</div>}
            {panel === "cart" ? (
              <>
                <span className="eyebrow">REVISAR PEDIDO</span>
                <h2>Tu pedido</h2>
                <p className="muted">
                  {data.table.name} · {data.restaurant.name}
                </p>
                <div className="cart-lines">
                  {cart.map((line, index) => {
                    const product = products.find(
                      (p) => p.id === line.productId,
                    );
                    return (
                      <div
                        className="cart-line"
                        key={`${line.productId}-${line.notes}-${index}`}
                      >
                        <div>
                          <b>
                            {line.quantity}× {product?.name || "Producto"}
                          </b>
                          {line.notes && <small>{line.notes}</small>}
                        </div>
                        <strong>
                          {money(Number(product?.price || 0) * line.quantity)}
                        </strong>
                        <button
                          aria-label={`Quitar ${product?.name}`}
                          onClick={() => {
                            setCart((lines) =>
                              lines.filter((_, i) => i !== index),
                            );
                            setRequestKey(null);
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <label className="field-label" htmlFor="customer-name">
                  Tu nombre (opcional)
                </label>
                <input
                  id="customer-name"
                  className="input"
                  value={name}
                  maxLength={80}
                  placeholder="¿Cómo te llamas?"
                  onChange={(event) => setName(event.target.value)}
                />
                <div className="total-row">
                  <span>Total estimado</span>
                  <strong>{money(cartTotal)}</strong>
                </div>
                <button
                  disabled={busy || offline || !cart.length}
                  className="button button-primary full"
                  onClick={sendOrder}
                >
                  {busy ? "Enviando…" : "Confirmar pedido"}
                  <ArrowRight size={18} />
                </button>
                <small className="muted">
                  El restaurante confirmará los precios al procesar el pedido.
                </small>
              </>
            ) : (
              <>
                <span className="eyebrow">CUANDO ESTÉS LISTO</span>
                <h2>¿Pedimos la cuenta?</h2>
                <p>Un miembro del equipo te ayudará con el pago en la mesa.</p>
                <div className="total-row">
                  <span>Total de tu mesa</span>
                  <strong>{money(sessionTotal)}</strong>
                </div>
                <button
                  disabled={busy || offline}
                  className="button button-primary full"
                  onClick={requestBill}
                >
                  {busy ? "Solicitando…" : "Solicitar cuenta"}
                  <ArrowRight size={18} />
                </button>
                <button
                  className="button button-quiet full"
                  onClick={() => setPanel(null)}
                >
                  Seguir disfrutando
                </button>
              </>
            )}
          </section>
        </div>
      )}
      <footer className="customer-footer">Buen provecho. ♡</footer>
    </div>
  );
}

function labelStatus(status: string) {
  return (
    (
      {
        PENDING: "Recibido",
        PREPARING: "En cocina",
        READY: "Listo",
        DELIVERED: "Entregado",
        CANCELLED: "Cancelado",
      } as Record<string, string>
    )[status] || status
  );
}
