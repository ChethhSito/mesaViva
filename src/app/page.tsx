import Link from "next/link";
import { ArrowRight, ChefHat, QrCode, ReceiptText } from "lucide-react";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="landing">
      <header className="site-header">
        <span className="brand">
          mesa<span>viva</span>
          <i>.</i>
        </span>
        <div className="header-actions">
          <Link className="text-link" href="/acceso">
            Entrar al panel <ArrowRight size={16} />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <section className="hero">
        <div className="eyebrow">PEDIDOS QUE FLUYEN</div>
        <h1>
          Tu restaurante,
          <br />
          <em>en una sola mesa.</em>
        </h1>
        <p>
          Del QR a la cocina. De la cuenta a la venta. Un servicio ágil, claro y
          conectado para todo el equipo.
        </p>
        <Link className="button button-primary" href="/acceso">
          Comenzar <ArrowRight size={18} />
        </Link>
      </section>
      <section className="feature-strip">
        <div>
          <QrCode />
          <strong>Menú QR</strong>
          <span>El cliente pide desde su mesa.</span>
        </div>
        <div>
          <ChefHat />
          <strong>Cocina en vivo</strong>
          <span>Cada pedido llega al instante.</span>
        </div>
        <div>
          <ReceiptText />
          <strong>Una sola cuenta</strong>
          <span>Pedidos adicionales, mismo servicio.</span>
        </div>
      </section>
      <footer>Diseñado para el ritmo real de un restaurante.</footer>
    </main>
  );
}
