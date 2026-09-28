# Mesa Viva

Sistema de pedidos por QR para restaurantes. El cliente consulta la carta, hace pedidos y sigue su cuenta desde la mesa; el equipo gestiona cocina, sala y caja desde un panel. Este repositorio contiene una primera versión funcional para instalación local, basada en [Next.js](https://nextjs.org/) y [Supabase](https://supabase.com/).

**Estado:** MVP funcional en entorno local. Aún quedan pendientes las pruebas de carga, los respaldos automáticos y la configuración de acceso público antes de utilizarlo como servicio de producción.

## Qué incluye

- Carta QR por mesa con categorías, precios, carrito, pedidos y estado de la cuenta.
- Panel del personal para mesas, productos, cocina, sala, cobro y ventas básicas.
- Roles de personal, validación de precios en el servidor y operaciones transaccionales para pedidos y pagos.
- Avisos en tiempo real con consulta de respaldo y tema claro/oscuro.
- Imagen de Next.js en [Docker Hub](https://hub.docker.com/r/chethhsitohuay/mesa-viva) y [guía de despliegue en Pop!_OS](./DESPLIEGUE_POP_OS.md).

El alcance original y las decisiones de producto están en [PROJECT.md — Restaurant QR Ordering System.md](./PROJECT.md%20%E2%80%94%20Restaurant%20QR%20Ordering%20System.md).

## Requisitos

- Node.js 20.9 o posterior.
- Un proyecto Supabase con Auth, Postgres y Realtime activados.

## Puesta en marcha

1. Instala dependencias con `npm install`.
2. En el editor SQL de Supabase ejecuta, en orden:
   - `supabase/migrations/0001_core.sql`
   - `supabase/migrations/0002_realtime.sql`
   - `supabase/migrations/0003_staff_setup.sql`
3. Crea `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`. La clave secreta **solo** se usa en el servidor y nunca debe llevar el prefijo `NEXT_PUBLIC_`. Consulta [la guía de despliegue](./DESPLIEGUE_POP_OS.md) para el formato de las variables.
4. Inicia con `npm run dev` y abre `http://localhost:3000`.
5. Crea una cuenta en `/acceso`. Si Supabase exige verificación por correo, confirma el correo antes de entrar. En `/panel` crea el restaurante, añade mesas, categorías y productos.
6. En Mesas, abre una mesa y pulsa **Abrir carta** o **Mostrar QR**. El cliente entra por ese enlace público, sin iniciar sesión. También puedes ver el QR en Configuración. Abre el panel en otro navegador para probar cocina, sala y caja.

El cliente ve las categorías, los productos y sus precios. Al hacer un pedido se crea o reutiliza la sesión de esa mesa; la misma carta muestra los productos pedidos, su estado y el total de la cuenta, incluso cuando el pedido lo tomó un mesero. La cocina usa `/panel`, pero el cliente permanece en `/r/<restaurante>/t/<token-de-mesa>`.

Si pruebas el QR en un celular, `localhost` apunta al propio celular. Abre la app desde una dirección de red accesible por ambos dispositivos o configura `NEXT_PUBLIC_APP_URL` en `.env.local` con tu dominio público y reinicia el servidor. En un despliegue, define esa variable antes de compilar.

Para añadir colaboradores: primero deben crear su propia cuenta en `/acceso`; luego un administrador introduce su correo y les asigna un rol desde Configuración. Un administrador puede recorrer todos los paneles con una sola cuenta durante la prueba inicial.

## Flujo implementado

1. El QR contiene un token aleatorio de mesa.
2. Cliente o camarero agregan productos; el servidor valida disponibilidad y toma el precio desde Postgres.
3. Todos los pedidos de esa visita se asocian a una única sesión de mesa.
4. La cocina marca cada producto en preparación y listo. Sala marca la entrega.
5. Cliente o sala solicitan la cuenta. Caja atiende, elige método y confirma el pago.
6. Una operación transaccional crea el pago y el movimiento financiero. Solo después se puede cerrar la mesa.

Las operaciones críticas de pedido y pago usan funciones SQL transaccionales. El identificador de envío evita pedidos duplicados al reintentar. Las tablas tienen RLS activo sin permisos directos de lectura/escritura desde el navegador. Las rutas del personal comprueban identidad, restaurante y rol antes de usar la clave de servicio. Realtime emite únicamente avisos vacíos: cada pantalla consulta los datos actualizados por su API. Hay una consulta de respaldo cada 15 segundos si se pierde un aviso.

## Estado actual

La aplicación y las tres migraciones se verificaron en el proyecto Supabase conectado el 26/09/2026. La prueba integral pasó, incluidos los avisos de Realtime y la comprobación de que la clave pública no puede leer directamente las tablas. La prueba retiró sus datos sintéticos; para empezar a usar el sistema, crea una cuenta real desde `/acceso` y configura tu restaurante en `/panel`.

Este corte no incluye variantes, inventario, facturación electrónica, pagos en línea ni reportes avanzados. Las imágenes de productos se introducen como URL; la subida a Supabase Storage queda para una siguiente iteración. El panel financiero muestra movimientos recientes y métricas básicas.

