import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, fail, publicError } from "@/lib/server";

const orderSchema = z.object({
  type: z.literal("order"),
  slug: z.string().min(1),
  token: z.string().min(1),
  customerName: z.string().trim().max(80).default(""),
  idempotencyKey: z.uuid(),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().max(300).default(""),
      }),
    )
    .min(1)
    .max(50),
});
const billSchema = z.object({
  type: z.literal("bill"),
  slug: z.string().min(1),
  token: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("slug") || "";
    const token = request.nextUrl.searchParams.get("token") || "";
    if (!slug || !token) return fail("Falta el identificador de la mesa.");
    const { data: restaurant, error: restaurantError } = await db()
      .from("restaurants")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle();
    if (restaurantError) throw restaurantError;
    if (!restaurant) return fail("Restaurante no encontrado.", 404);
    const { data: table, error: tableError } = await db()
      .from("restaurant_tables")
      .select("id,name,qr_token,enabled")
      .eq("restaurant_id", restaurant.id)
      .eq("qr_token", token)
      .eq("enabled", true)
      .maybeSingle();
    if (tableError) throw tableError;
    if (!table)
      return fail("El código QR de esta mesa no está disponible.", 404);
    const [categoriesResult, productsResult, sessionResult] = await Promise.all(
      [
        db()
          .from("categories")
          .select("id,name,sort_order")
          .eq("restaurant_id", restaurant.id)
          .order("sort_order"),
        db()
          .from("products")
          .select(
            "id,category_id,name,description,image_url,allergens,price,available,active",
          )
          .eq("restaurant_id", restaurant.id)
          .eq("active", true)
          .order("name"),
        db()
          .from("table_sessions")
          .select("id,table_id,customer_name,status,opened_at,closed_at")
          .eq("table_id", table.id)
          .not("status", "in", "(CLOSED,CANCELLED)")
          .maybeSingle(),
      ],
    );
    if (categoriesResult.error) throw categoriesResult.error;
    if (productsResult.error) throw productsResult.error;
    if (sessionResult.error) throw sessionResult.error;
    const categories = categoriesResult.data;
    const products = productsResult.data;
    const session = sessionResult.data;
    let orders: unknown[] = [];
    let items: unknown[] = [];
    if (session) {
      const { data, error: ordersError } = await db()
        .from("orders")
        .select("id,table_session_id,order_number,source,status,created_at")
        .eq("table_session_id", session.id)
        .order("created_at");
      if (ordersError) throw ordersError;
      orders = data || [];
      if (data?.length) {
        const result = await db()
          .from("order_items")
          .select(
            "id,order_id,product_name_snapshot,unit_price,quantity,notes,status",
          )
          .in(
            "order_id",
            data.map((o) => o.id),
          );
        if (result.error) throw result.error;
        items = result.data || [];
      }
    }
    return NextResponse.json({
      restaurant,
      table,
      categories: categories || [],
      products: products || [],
      session,
      orders,
      items,
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const bill = billSchema.safeParse(body);
    if (bill.success) {
      const { data, error } = await db().rpc("request_bill", {
        p_slug: bill.data.slug,
        p_token: bill.data.token,
      });
      if (error) return fail(error.message);
      return NextResponse.json({ sessionId: data });
    }
    const order = orderSchema.safeParse(body);
    if (!order.success)
      return fail("Revisa los productos y cantidades del pedido.");
    const { data, error } = await db().rpc("place_order", {
      p_slug: order.data.slug,
      p_token: order.data.token,
      p_customer_name: order.data.customerName,
      p_items: order.data.items,
      p_idempotency_key: order.data.idempotencyKey,
      p_source: "QR",
      p_actor: null,
    });
    if (error) return fail(error.message);
    return NextResponse.json({ orderId: data });
  } catch (error) {
    return publicError(error);
  }
}
