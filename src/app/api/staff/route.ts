import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentMember, db, fail, publicError } from "@/lib/server";

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setup"),
    name: z.string().trim().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  }),
  z.object({
    type: z.literal("add-member"),
    email: z.email(),
    role: z.enum(["WAITER", "KITCHEN", "CASHIER", "FINANCE", "ADMIN"]),
  }),
  z.object({
    type: z.literal("table"),
    name: z.string().trim().min(2).max(40),
  }),
  z.object({
    type: z.literal("category"),
    name: z.string().trim().min(2).max(50),
  }),
  z.object({
    type: z.literal("product"),
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500),
    categoryId: z.uuid(),
    price: z.number().min(0).max(99999),
    imageUrl: z.union([z.url(), z.literal("")]),
    allergens: z.string().max(200),
  }),
  z.object({
    type: z.literal("availability"),
    productId: z.uuid(),
    available: z.boolean(),
  }),
  z.object({
    type: z.literal("item-status"),
    itemId: z.uuid(),
    status: z.enum(["PREPARING", "READY", "DELIVERED"]),
  }),
  z.object({ type: z.literal("payment-pending"), sessionId: z.uuid() }),
  z.object({ type: z.literal("request-bill"), sessionId: z.uuid() }),
  z.object({
    type: z.literal("payment"),
    sessionId: z.uuid(),
    method: z.enum(["CASH", "PHYSICAL_POS", "YAPE", "PLIN", "OTHER"]),
  }),
  z.object({ type: z.literal("close"), sessionId: z.uuid() }),
  z.object({
    type: z.literal("order"),
    token: z.string(),
    customerName: z.string().max(80),
    idempotencyKey: z.uuid(),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          quantity: z.number().int().min(1).max(99),
          notes: z.string().max(300),
        }),
      )
      .min(1),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const auth = await currentMember(request);
    if (!auth) return fail("Inicia sesión para continuar.", 401);
    if (!auth.member)
      return NextResponse.json({ setup: true, userId: auth.user.id });
    const restaurantId = auth.member.restaurant_id;
    const [
      restaurantResult,
      tablesResult,
      categoriesResult,
      productsResult,
      sessionsResult,
      paymentsResult,
    ] = await Promise.all([
      db()
        .from("restaurants")
        .select("id,name,slug")
        .eq("id", restaurantId)
        .single(),
      db()
        .from("restaurant_tables")
        .select("id,name,qr_token,enabled")
        .eq("restaurant_id", restaurantId)
        .order("name"),
      db()
        .from("categories")
        .select("id,name,sort_order")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      db()
        .from("products")
        .select(
          "id,category_id,name,description,image_url,allergens,price,available,active",
        )
        .eq("restaurant_id", restaurantId)
        .order("name"),
      db()
        .from("table_sessions")
        .select("id,table_id,customer_name,status,opened_at,closed_at")
        .eq("restaurant_id", restaurantId)
        .order("opened_at", { ascending: false })
        .limit(300),
      db()
        .from("payments")
        .select("id,table_session_id,amount,method,confirmed_at")
        .eq("restaurant_id", restaurantId)
        .order("confirmed_at", { ascending: false })
        .limit(200),
    ]);
    for (const result of [
      restaurantResult,
      tablesResult,
      categoriesResult,
      productsResult,
      sessionsResult,
      paymentsResult,
    ]) {
      if (result.error) throw result.error;
    }
    const restaurant = restaurantResult.data;
    const tables = tablesResult.data;
    const categories = categoriesResult.data;
    const products = productsResult.data;
    const sessions = sessionsResult.data;
    const payments = paymentsResult.data;
    const sessionIds = (sessions || []).map((s) => s.id);
    const { data: orders, error: ordersError } = sessionIds.length
      ? await db()
          .from("orders")
          .select("id,table_session_id,order_number,source,status,created_at")
          .in("table_session_id", sessionIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (ordersError) throw ordersError;
    const orderIds = (orders || []).map((o) => o.id);
    const { data: items, error: itemsError } = orderIds.length
      ? await db()
          .from("order_items")
          .select(
            "id,order_id,product_name_snapshot,unit_price,quantity,notes,status",
          )
          .in("order_id", orderIds)
      : { data: [], error: null };
    if (itemsError) throw itemsError;
    return NextResponse.json({
      userId: auth.user.id,
      role: auth.member.role,
      restaurant,
      tables: tables || [],
      categories: categories || [],
      products: products || [],
      sessions: sessions || [],
      orders: orders || [],
      items: items || [],
      payments: payments || [],
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await currentMember(request);
    if (!auth) return fail("Inicia sesión para continuar.", 401);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Revisa los datos enviados.");
    const input = parsed.data;
    if (input.type === "setup") {
      if (auth.member) return fail("Ya perteneces a un restaurante.");
      const { error } = await db().rpc("create_restaurant", {
        p_name: input.name,
        p_slug: input.slug,
        p_actor: auth.user.id,
      });
      if (error) return fail(error.message);
      return NextResponse.json({ ok: true });
    }
    if (!auth.member) return fail("Primero configura un restaurante.", 403);
    const restaurantId = auth.member.restaurant_id;
    const role = auth.member.role;
    const admin = role === "ADMIN";
    const service = admin || role === "WAITER" || role === "CASHIER";
    const kitchen = admin || role === "KITCHEN";
    if (input.type === "add-member") {
      if (!admin)
        return fail("Solo un administrador puede asignar roles.", 403);
      const { data: users, error } = await db().auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (error) return fail("No se pudo buscar la cuenta.");
      const user = users.users.find(
        (user) => user.email?.toLowerCase() === input.email.toLowerCase(),
      );
      if (!user) return fail("Esta persona debe crear su cuenta primero.");
      const { error: insertError } = await db()
        .from("restaurant_members")
        .insert({
          restaurant_id: restaurantId,
          user_id: user.id,
          role: input.role,
        });
      if (insertError) return fail(insertError.message);
      await db()
        .from("audit_logs")
        .insert({
          restaurant_id: restaurantId,
          actor_user_id: auth.user.id,
          event_type: "USER_PERMISSION_CHANGED",
          entity_type: "user",
          entity_id: user.id,
          metadata: { role: input.role },
        });
    } else if (
      input.type === "table" ||
      input.type === "category" ||
      input.type === "product" ||
      input.type === "availability"
    ) {
      if (!admin && !(input.type === "availability" && kitchen))
        return fail("No tienes permiso para esta acción.", 403);
      if (input.type === "table") {
        const { error } = await db()
          .from("restaurant_tables")
          .insert({ restaurant_id: restaurantId, name: input.name });
        if (error) return fail(error.message);
      } else if (input.type === "category") {
        const { error } = await db()
          .from("categories")
          .insert({ restaurant_id: restaurantId, name: input.name });
        if (error) return fail(error.message);
      } else if (input.type === "product") {
        const { data: category } = await db()
          .from("categories")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("id", input.categoryId)
          .maybeSingle();
        if (!category) return fail("Categoría no válida.");
        const { error } = await db()
          .from("products")
          .insert({
            restaurant_id: restaurantId,
            category_id: input.categoryId,
            name: input.name,
            description: input.description,
            price: input.price,
            image_url: input.imageUrl || null,
            allergens: input.allergens,
          });
        if (error) return fail(error.message);
      } else {
        const { error } = await db()
          .from("products")
          .update({ available: input.available })
          .eq("restaurant_id", restaurantId)
          .eq("id", input.productId);
        if (error) return fail(error.message);
      }
    } else if (input.type === "order") {
      if (!service) return fail("No tienes permiso para crear pedidos.", 403);
      const { data: table } = await db()
        .from("restaurant_tables")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("qr_token", input.token)
        .maybeSingle();
      if (!table) return fail("Mesa no válida.");
      const { data: restaurant } = await db()
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .single();
      const { error } = await db().rpc("place_order", {
        p_slug: restaurant?.slug,
        p_token: input.token,
        p_customer_name: input.customerName,
        p_items: input.items,
        p_idempotency_key: input.idempotencyKey,
        p_source: "WAITER",
        p_actor: auth.user.id,
      });
      if (error) return fail(error.message);
    } else if (input.type === "item-status") {
      if (input.status === "DELIVERED" ? !service : !kitchen)
        return fail("No tienes permiso para actualizar este producto.", 403);
      const { data: item } = await db()
        .from("order_items")
        .select("id,order_id,status")
        .eq("id", input.itemId)
        .maybeSingle();
      if (!item) return fail("Producto del pedido no encontrado.", 404);
      const { data: order } = await db()
        .from("orders")
        .select("id,restaurant_id")
        .eq("id", item.order_id)
        .maybeSingle();
      if (order?.restaurant_id !== restaurantId)
        return fail("Pedido no autorizado.", 403);
      const allowed =
        (item.status === "PENDING" && input.status === "PREPARING") ||
        (item.status === "PREPARING" && input.status === "READY") ||
        (item.status === "READY" && input.status === "DELIVERED");
      if (!allowed) return fail("Cambio de estado no permitido.");
      const { error } = await db()
        .from("order_items")
        .update({ status: input.status })
        .eq("id", input.itemId)
        .eq("status", item.status);
      if (error) return fail(error.message);
      const { data: allItems } = await db()
        .from("order_items")
        .select("status")
        .eq("order_id", item.order_id);
      const statuses = (allItems || []).map((i) => i.status);
      const orderStatus = statuses.every((s) => s === "DELIVERED")
        ? "DELIVERED"
        : statuses.every((s) => s === "READY" || s === "DELIVERED")
          ? "READY"
          : "PREPARING";
      await db()
        .from("orders")
        .update({ status: orderStatus })
        .eq("id", item.order_id);
    } else {
      if (!service) return fail("No tienes permiso para gestionar pagos.", 403);
      const { data: session } = await db()
        .from("table_sessions")
        .select("id,status")
        .eq("id", input.sessionId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (!session) return fail("Cuenta no encontrada.", 404);
      if (input.type === "request-bill") {
        if (!["OPEN", "IN_SERVICE"].includes(session.status))
          return fail("Esta cuenta ya está en proceso de pago.");
        const { error } = await db()
          .from("table_sessions")
          .update({ status: "BILL_REQUESTED" })
          .eq("id", session.id)
          .in("status", ["OPEN", "IN_SERVICE"]);
        if (error) return fail(error.message);
      } else if (input.type === "payment-pending") {
        if (session.status !== "BILL_REQUESTED")
          return fail("La cuenta aún no fue solicitada.");
        const { error } = await db()
          .from("table_sessions")
          .update({ status: "PAYMENT_PENDING" })
          .eq("id", session.id);
        if (error) return fail(error.message);
      } else if (input.type === "payment") {
        const { error } = await db().rpc("confirm_payment", {
          p_session: session.id,
          p_method: input.method,
          p_actor: auth.user.id,
        });
        if (error) return fail(error.message);
      } else {
        const { error } = await db().rpc("close_table", {
          p_session: session.id,
          p_actor: auth.user.id,
        });
        if (error) return fail(error.message);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return publicError(error);
  }
}
