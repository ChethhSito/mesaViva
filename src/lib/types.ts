export type Category = { id: string; name: string; sort_order: number };
export type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string | null;
  allergens: string;
  price: number;
  available: boolean;
  active: boolean;
};
export type Table = {
  id: string;
  name: string;
  qr_token: string;
  enabled: boolean;
};
export type Session = {
  id: string;
  table_id: string;
  customer_name: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};
export type Order = {
  id: string;
  table_session_id: string;
  order_number: number;
  source: "QR" | "WAITER";
  status: string;
  created_at: string;
};
export type OrderItem = {
  id: string;
  order_id: string;
  product_name_snapshot: string;
  unit_price: number;
  quantity: number;
  notes: string;
  status: string;
};
export type Payment = {
  id: string;
  table_session_id: string;
  amount: number;
  method: string;
  confirmed_at: string;
};
export type PublicData = {
  restaurant: { id: string; name: string; slug: string };
  table: Table;
  categories: Category[];
  products: Product[];
  session: Session | null;
  orders: Order[];
  items: OrderItem[];
};
export type StaffData = {
  setup?: boolean;
  userId: string;
  role?: string;
  restaurant?: { id: string; name: string; slug: string };
  tables?: Table[];
  categories?: Category[];
  products?: Product[];
  sessions?: Session[];
  orders?: Order[];
  items?: OrderItem[];
  payments?: Payment[];
};
export const money = (value: number | string) =>
  `S/ ${Number(value).toFixed(2)}`;
export function total(items: OrderItem[]) {
  return items
    .filter((i) => i.status !== "CANCELLED")
    .reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
}
