# Mesa Viva

Primer corte funcional del sistema descrito en [PROJECT.md — Restaurant QR Ordering System.md](./PROJECT.md%20%E2%80%94%20Restaurant%20QR%20Ordering%20System.md). Incluye el recorrido de mesa, menú QR, pedidos, cocina, sala, cuenta, caja y registro de ventas.

## Requisitos

- Node.js 20.9 o posterior.
- Un proyecto Supabase con Auth, Postgres y Realtime activados.

## Puesta en marcha

1. Instala dependencias con `npm install`.
2. En el editor SQL de Supabase ejecuta, en orden:
   - `supabase/migrations/0001_core.sql`
   - `supabase/migrations/0002_realtime.sql`
   - `supabase/migrations/0003_staff_setup.sql`
3. Copia `.env.example` a `.env.local` y completa la URL, la clave publicable y la clave secreta del proyecto. La clave secreta **solo** se usa en el servidor y nunca debe llevar el prefijo `NEXT_PUBLIC_`.
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

## Comprobaciones

```sh
npm run typecheck
npm run lint
npm run build
npm run smoke -- --run
```

Para la prueba integral, deja `npm run dev` ejecutándose en otra terminal. `smoke` crea una cuenta, restaurante, mesa, productos, pedidos y pago sintéticos; verifica el flujo y elimina sus propios datos al terminar. No lo ejecutes mientras haces cambios manuales sobre esos datos de prueba.

## Estado actual

La aplicación y las tres migraciones se verificaron en el proyecto Supabase conectado el 26/09/2026. La prueba integral pasó, incluidos los avisos de Realtime y la comprobación de que la clave pública no puede leer directamente las tablas. La prueba retiró sus datos sintéticos; para empezar a usar el sistema, crea una cuenta real desde `/acceso` y configura tu restaurante en `/panel`.

Este corte no incluye variantes, inventario, facturación electrónica, pagos en línea ni reportes avanzados. Las imágenes de productos se introducen como URL; la subida a Supabase Storage queda para una siguiente iteración. El panel financiero muestra movimientos recientes y métricas básicas.

## Tipografía de la prueba local

Sensei, desde `fontnew/Sensei-Medium.otf`, se usa solo en los titulares grandes de la portada, la carta y el acceso. Red Hat Display se usa en los demás encabezados y Red Hat Text en el texto y los controles. Los tamaños comunes están definidos como variables en `src/app/globals.css`.

El titular del proyecto confirmó que cuenta con permiso para distribuir Sensei. El repositorio y la imagen incluyen únicamente el archivo OTF utilizado por la aplicación; el PDF incluido originalmente en `fontnew` no acredita esa licencia y no se publica.

La carta centra la información de bienvenida en el banner. El icono de luna/sol cambia entre tema claro y oscuro en la portada, la carta y el panel; la preferencia queda guardada en este navegador. El tema oscuro usa `#2c2e31` como fondo principal.

## Despliegue en Pop!_OS

Consulta [DESPLIEGUE_POP_OS.md](./DESPLIEGUE_POP_OS.md) para construir la imagen con Podman, iniciar Next.js en la laptop y, si sus recursos lo permiten, migrar de Supabase Cloud a Supabase self-hosted.

La imagen de la fase 2 también está en [Docker Hub](https://hub.docker.com/r/chethhsitohuay/mesa-viva): `docker.io/chethhsitohuay/mesa-viva:6c54ed9`. Se compiló para el proyecto Supabase Cloud actual; una migración a Supabase self-hosted requiere reconstruirla con la nueva URL y clave publicable.
