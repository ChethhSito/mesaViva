import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

if (process.argv[2] !== "--run") {
  console.error(
    "Uso: npm run smoke -- --run (crea y elimina datos sintéticos)",
  );
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !publicKey || !secretKey)
  throw new Error("Faltan variables de Supabase");

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = createClient(url, publicKey);
const apiRoot = process.env.SMOKE_APP_URL || "http://localhost:3000";
let userId;
let restaurantId;
let testSlug;
const channels = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, token, body) {
  const response = await fetch(`${apiRoot}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${result.error || "Error"}`);
  return result;
}

async function subscribe(channel, label) {
  channels.push(channel);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Realtime ${label}: no conectó`)),
      10000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Realtime ${label}: ${status}`));
      }
    });
  });
}

async function cleanup() {
  for (const channel of channels)
    await client.removeChannel(channel).catch(() => {});
  if (!restaurantId && testSlug) {
    const lookup = await admin
      .from("restaurants")
      .select("id")
      .eq("slug", testSlug)
      .maybeSingle();
    restaurantId = lookup.data?.id;
  }
  if (restaurantId) {
    const { data: orders } = await admin
      .from("orders")
      .select("id")
      .eq("restaurant_id", restaurantId);
    if (orders?.length)
      await admin
        .from("order_items")
        .delete()
        .in(
          "order_id",
          orders.map((order) => order.id),
        );
    for (const table of [
      "financial_movements",
      "audit_logs",
      "payments",
      "orders",
      "table_sessions",
      "products",
      "categories",
      "restaurant_tables",
      "restaurant_members",
      "restaurants",
    ]) {
      const column = table === "restaurants" ? "id" : "restaurant_id";
      const { error } = await admin
        .from(table)
        .delete()
        .eq(column, restaurantId);
      if (error) console.error(`CLEANUP_ERROR ${table}: ${error.message}`);
    }
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`CLEANUP_ERROR auth: ${error.message}`);
  }
  client.realtime.disconnect();
  await client.auth.signOut().catch(() => {});
}

try {
  const suffix = randomUUID().slice(0, 8);
  const email = `mesa-viva-smoke-${suffix}@example.com`;
  const password = `Test-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw created.error || new Error("No se pudo crear usuario de prueba");
  userId = created.data.user.id;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw signedIn.error || new Error("No inició sesión el usuario de prueba");
  const token = signedIn.data.session.access_token;
  const slug = `mesa-viva-smoke-${suffix}`;
  testSlug = slug;
  await api("/api/staff", token, {
    type: "setup",
    name: `Mesa Viva Prueba ${suffix}`,
    slug,
  });
  let staff = await api("/api/staff", token);
  restaurantId = staff.restaurant?.id;
  assert(
    restaurantId && staff.role === "ADMIN",
    "No se creó el restaurante con rol ADMIN",
  );
  await api("/api/staff", token, { type: "table", name: "Mesa Prueba" });
  await api("/api/staff", token, { type: "category", name: "Platos" });
  await api("/api/staff", token, { type: "category", name: "Bebidas" });
  staff = await api("/api/staff", token);
  const table = staff.tables.find((entry) => entry.name === "Mesa Prueba");
  const plates = staff.categories.find((entry) => entry.name === "Platos");
  const drinks = staff.categories.find((entry) => entry.name === "Bebidas");
  assert(table && plates && drinks, "No se crearon mesa y categorías");
  await api("/api/staff", token, {
    type: "product",
    name: "Plato de prueba",
    description: "Prueba",
    categoryId: plates.id,
    price: 25,
    imageUrl: "",
    allergens: "",
  });
  await api("/api/staff", token, {
    type: "product",
    name: "Bebida de prueba",
    description: "Prueba",
    categoryId: drinks.id,
    price: 8,
    imageUrl: "",
    allergens: "",
  });
  staff = await api("/api/staff", token);
  const plate = staff.products.find(
    (entry) => entry.name === "Plato de prueba",
  );
  const drink = staff.products.find(
    (entry) => entry.name === "Bebida de prueba",
  );
  assert(plate && drink, "No se crearon productos");
  const menu = await api(`/api/public?slug=${slug}&token=${table.qr_token}`);
  assert(
    menu.table.id === table.id && menu.products.length === 2,
    "Menú QR incorrecto",
  );
  console.log("OK restaurante, mesa, menú y roles");

  await client.realtime.setAuth(token);
  let staffEvents = 0;
  let tableEvents = 0;
  const staffChannel = client
    .channel(`restaurant:${restaurantId}`, { config: { private: true } })
    .on("broadcast", { event: "refresh" }, () => staffEvents++);
  const tableChannel = client
    .channel(`table:${table.qr_token}`)
    .on("broadcast", { event: "refresh" }, () => tableEvents++);
  await Promise.all([
    subscribe(staffChannel, "personal"),
    subscribe(tableChannel, "mesa"),
  ]);

  const firstKey = randomUUID();
  const firstOrder = {
    type: "order",
    slug,
    token: table.qr_token,
    customerName: "Cliente de prueba",
    idempotencyKey: firstKey,
    items: [
      { productId: plate.id, quantity: 2, notes: "Sin cebolla" },
      { productId: drink.id, quantity: 1, notes: "" },
    ],
  };
  const first = await api("/api/public", null, firstOrder);
  const repeated = await api("/api/public", null, firstOrder);
  assert(first.orderId === repeated.orderId, "El reintento duplicó el pedido");
  await api("/api/public", null, {
    ...firstOrder,
    idempotencyKey: randomUUID(),
    items: [{ productId: drink.id, quantity: 1, notes: "" }],
  });
  staff = await api("/api/staff", token);
  const session = staff.sessions.find(
    (entry) => entry.table_id === table.id && entry.status === "IN_SERVICE",
  );
  assert(session, "No hay sesión activa");
  const sessionOrders = staff.orders.filter(
    (entry) => entry.table_session_id === session.id,
  );
  assert(
    sessionOrders.length === 2,
    "Los pedidos adicionales no comparten sesión",
  );
  const orderItems = staff.items.filter((entry) =>
    sessionOrders.some((order) => order.id === entry.order_id),
  );
  assert(orderItems.length === 3, "Cantidad incorrecta de productos");
  for (const item of orderItems) {
    await api("/api/staff", token, {
      type: "item-status",
      itemId: item.id,
      status: "PREPARING",
    });
    await api("/api/staff", token, {
      type: "item-status",
      itemId: item.id,
      status: "READY",
    });
    await api("/api/staff", token, {
      type: "item-status",
      itemId: item.id,
      status: "DELIVERED",
    });
  }
  console.log("OK pedidos, idempotencia, cocina y entrega");

  await api("/api/public", null, { type: "bill", slug, token: table.qr_token });
  await api("/api/staff", token, {
    type: "payment-pending",
    sessionId: session.id,
  });
  await api("/api/staff", token, {
    type: "payment",
    sessionId: session.id,
    method: "CASH",
  });
  const payment = await admin
    .from("payments")
    .select("amount")
    .eq("table_session_id", session.id)
    .single();
  assert(
    !payment.error && Number(payment.data.amount) === 66,
    "El importe del pago no coincide con los precios del servidor",
  );
  const movement = await admin
    .from("financial_movements")
    .select("amount,type")
    .eq("restaurant_id", restaurantId)
    .single();
  assert(
    !movement.error &&
      movement.data.type === "SALE" &&
      Number(movement.data.amount) === 66,
    "Falta el movimiento financiero",
  );
  await api("/api/staff", token, { type: "close", sessionId: session.id });
  const final = await api(`/api/public?slug=${slug}&token=${table.qr_token}`);
  assert(final.session === null, "La mesa no volvió a quedar disponible");
  console.log("OK cuenta, pago, venta y cierre de mesa");

  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert(
    staffEvents > 0 && tableEvents > 0,
    `Realtime no notificó a ambos clientes (personal=${staffEvents}, mesa=${tableEvents})`,
  );
  console.log(`OK Realtime personal=${staffEvents} mesa=${tableEvents}`);
} catch (error) {
  console.error("SMOKE_FAILED", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
  console.log("Datos sintéticos retirados");
}
