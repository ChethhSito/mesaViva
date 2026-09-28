import CustomerMenu from "@/components/customer-menu";

export default async function TablePage({
  params,
}: {
  params: Promise<{ restaurant: string; table: string }>;
}) {
  const { restaurant, table } = await params;
  return <CustomerMenu slug={restaurant} token={table} />;
}
