# Despliegue de Mesa Viva en Pop!_OS

Este proyecto usa Next.js 16.3.6, Supabase Auth, PostgreSQL y Realtime. La imagen contiene la aplicación; **no** contiene la base de datos ni las claves secretas. La clave `SUPABASE_SECRET_KEY` se proporciona solo al iniciar el contenedor.

## Antes de empezar

- Laptop conectada a corriente, sin suspensión automática al cerrar la tapa, con espacio libre en SSD y reinicio automático después de un corte de energía si el equipo lo permite.
- Un dominio para producción. Los QR dependen de `NEXT_PUBLIC_APP_URL`; si cambias esa URL tendrás que reconstruir la imagen y posiblemente reimprimir los QR.
- Una copia de seguridad **fuera de la laptop** antes de mover datos.
- Para Supabase completo, sus requisitos publicados son 4 GB RAM/2 núcleos/40 GB SSD como mínimo y 8 GB RAM/4 núcleos/80 GB SSD recomendados. Next.js y Pop!_OS requieren recursos adicionales. Si la laptop tiene 8 GB de RAM o menos, mide primero la fase 2 y considera mantener Supabase Cloud.

## Fase 2: Next.js con Podman y Supabase Cloud

1. Instala Git y Podman en la laptop. Podman está disponible en los repositorios de Ubuntu, base de Pop!_OS:

   ```bash
   sudo apt update
   sudo apt install git podman
   podman --version
   ```

2. Comprueba `uname -m`: la imagen publicada es para `x86_64`/`amd64`. Descárgala de Docker Hub; para esta instalación no necesitas clonar GitHub:

   ```bash
   podman pull docker.io/chethhsitohuay/mesa-viva:6c54ed9
   ```

   Crea `~/mesa-viva.env` con permisos restringidos y los valores del **mismo proyecto Supabase Cloud** usado para construir esta imagen:

   ```bash
   nano ~/mesa-viva.env
   chmod 600 ~/mesa-viva.env
   ```

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   ```

   `SUPABASE_SECRET_KEY` se entrega únicamente al contenedor en ejecución; no se encuentra en Docker Hub. Los valores públicos sí quedaron incorporados en el JavaScript de esta versión. No compartas el archivo de variables.

3. Si necesitas cambiar el proyecto Supabase o fijar `NEXT_PUBLIC_APP_URL` para los QR, reconstruye desde GitHub y usa la nueva imagen en los pasos siguientes:

   ```bash
   git clone https://github.com/ChethhSito/mesaViva.git ~/mesaViva
   cd ~/mesaViva
   ```

   Las tres variables `NEXT_PUBLIC_*` se fijan durante la compilación. La clave secreta no se pasa al build:

   ```bash
   cd ~/mesaViva
   source ~/mesa-viva.env
   podman build -t localhost/mesa-viva:latest \
     --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
     --build-arg NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-}" \
     -f Dockerfile .
   ```

4. Haz una prueba local sin publicar el puerto en toda la red. Usa `localhost/mesa-viva:latest` si reconstruiste en el paso 3:

   ```bash
   podman run --rm --name mesa-viva-prueba \
     -p 127.0.0.1:3000:3000 \
     --env-file ~/mesa-viva.env \
     docker.io/chethhsitohuay/mesa-viva:6c54ed9
   ```

   Abre `http://127.0.0.1:3000`. Prueba acceso del personal, menú QR, pedido, cocina y cuenta. Detén la prueba con `Ctrl+C`.

5. Para mantener la aplicación iniciada al arrancar Pop!_OS, usa Quadlet de Podman **si la versión instalada lo incluye y usa cgroup v2**. Comprueba `podman --version` y `podman info --format '{{.Host.CgroupVersion}}'`; si tu versión no genera servicios Quadlet, actualiza Podman antes de este paso. Crea `~/.config/containers/systemd/mesa-viva.container` con este contenido y sustituye `USUARIO` por el nombre real de tu usuario Linux. Usa `Image=localhost/mesa-viva:latest` si reconstruiste en el paso 3:

   ```ini
   [Unit]
   Description=Mesa Viva Next.js

   [Container]
   Image=docker.io/chethhsitohuay/mesa-viva:6c54ed9
   PublishPort=127.0.0.1:3000:3000
   EnvironmentFile=/home/USUARIO/mesa-viva.env

   [Service]
   Restart=always

   [Install]
   WantedBy=default.target
   ```

   ```bash
   mkdir -p ~/.config/containers/systemd
   nano ~/.config/containers/systemd/mesa-viva.container
   systemctl --user daemon-reload
   systemctl --user start mesa-viva.service
   systemctl --user status mesa-viva.service
   sudo loginctl enable-linger "$USER"
   ```

   Consulta los registros con `journalctl --user -u mesa-viva.service -f`. Para actualizar una imagen de Docker Hub, cambia a una etiqueta publicada nueva y ejecuta `podman pull` y `systemctl --user restart mesa-viva.service`. Si reconstruyes desde código, usa `git pull`, reconstruye la imagen y reinicia el servicio. Coloca un proxy HTTPS delante de `127.0.0.1:3000` antes de ofrecer acceso por Internet.

## Fase 3: Supabase self-hosted, después de medir la laptop

La configuración oficial de Supabase se distribuye para **Docker Compose**. Usa Docker Engine + Compose para esta fase; Podman sigue sirviendo la imagen de Next.js. Pop!_OS deriva de Ubuntu, pero Docker no certifica todas las distribuciones derivadas: comprueba la versión base de Ubuntu antes de seguir su [guía de instalación](https://docs.docker.com/engine/install/ubuntu/). Verifica con `docker --version` y `docker compose version`.

1. Instala una versión **fija** de la configuración self-hosted siguiendo [Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker). La guía actual ofrece una instalación manual y un script de instalación; revisa el script antes de ejecutarlo. Crea la instancia en un directorio distinto de `~/mesaViva`.
2. Genera sus contraseñas y claves con los scripts oficiales. Guarda el `.env` de Supabase fuera de Git y con permisos restringidos. Configura `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` y `SITE_URL`. Configura SMTP si usarás verificación o recuperación de cuentas por correo.
3. Antes de `sh run.sh start`, revisa los puertos publicados por Compose. PostgreSQL, Studio y los puertos internos deben quedar accesibles solo desde la laptop o red administrativa. Un firewall por sí solo puede no bloquear los puertos que Docker publique; comprueba también las asignaciones de puertos en Compose.
4. Haz un backup del proyecto Supabase Cloud. Sigue [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform): exporta **roles, esquema y datos** con Supabase CLI, restaura en la instancia nueva y compara recuentos, `auth.users`, funciones, disparadores y políticas RLS. **No vuelvas a ejecutar las tres migraciones del repositorio sobre una base restaurada**: su esquema ya está incluido en el volcado.
5. Comprueba `/acceso`, `/panel`, carta QR, pedidos, cocina, cuenta, pago y Realtime con datos de prueba. Conserva los tokens de mesa durante la migración para mantener los QR existentes. Las imágenes de productos hoy son URLs externas; no hay objetos propios de Supabase Storage que transferir. Si se incorporan subidas de archivos más adelante, habrá que migrar también esos objetos.
6. Sustituye en `~/mesa-viva.env` la URL, la clave publicable y la clave secreta por las de la instancia nueva. **Reconstruye** la imagen de Next.js porque las variables `NEXT_PUBLIC_*` quedan incorporadas en el JavaScript del navegador. Prueba primero la instalación nueva sin cambiar el acceso de los clientes.
7. Planifica un corte breve: detén pedidos nuevos en el origen, toma un volcado final, restáuralo, valida y cambia la URL pública. Mantén el origen disponible para revertir durante la prueba inicial. Cualquier pedido creado tras el cambio exigiría conciliación manual si retrocedes.

### Acceso por Internet tras la migración

La app actual se conecta a Supabase desde el navegador para Auth y Realtime. Por ello, cuando Supabase sea self-hosted, necesita una API HTTPS accesible desde los clientes, por ejemplo `api.tudominio.com`. El proxy debe admitir WebSockets. Publica únicamente las rutas necesarias de Auth, Realtime y REST; bloquea Studio (`/`), `/pg/`, PostgreSQL (`5432`) y los paneles administrativos para Internet. El gateway de Supabase enruta también a Studio, así que **no** basta con publicar el puerto `8000` completo. Consulta [HTTPS y proxy](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https) y [rutas del gateway](https://supabase.com/docs/guides/self-hosting/self-hosted-envoy).

## Verificación antes de abrir al público

- Backup automático de PostgreSQL, configuración y cualquier archivo local, copiado a otro dispositivo o servicio; prueba una restauración completa. Los backups administrados y PITR de Supabase Cloud no vienen incluidos en self-hosted.
- Pruebas de 5, 10 y 20 clientes simultáneos con datos sintéticos. Mide latencia de menú y pedido, errores, RAM, CPU, disco y conexiones Realtime.
- Comprueba reinicio de la laptop, pérdida de Internet y recuperación del servicio. Mantén la laptop conectada a corriente y, si es posible, a un UPS.

## Fuentes

- [Next.js: self-hosting](https://nextjs.org/docs/app/guides/self-hosting) y [salida standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
- [Podman: instalación](https://podman.io/docs/installation) y [Quadlet](https://docs.podman.io/en/latest/markdown/podman-quadlet-basic-usage.7.html).
- [Supabase: Docker self-hosted](https://supabase.com/docs/guides/self-hosting/docker), [migración desde Cloud](https://supabase.com/docs/guides/self-hosting/restore-from-platform) y [responsabilidades de operación](https://supabase.com/docs/guides/self-hosting).
