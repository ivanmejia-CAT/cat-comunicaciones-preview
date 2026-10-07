# Vista previa privada en Render Free

## Preparado

- Servicio Node.js con puerto `PORT` y host `0.0.0.0` de Render.
- Endpoint `/healthz` para comprobar disponibilidad.
- `render.yaml` para crear un Web Service Free en el tablero de pruebas de Trello.
- Autenticación HTTP Basic en producción para que el sitio completo no quede abierto por enlace.
- Variables de Trello, Google OAuth y contraseña fuera del repositorio (`sync: false`).

## Publicación

1. Conectar un repositorio **privado** de GitHub o GitLab con Render. Subir el contenido de esta carpeta como raíz del repositorio (`package.json`, `server.mjs`, `index.html`, CSS, JS, logo y `render.yaml`).
2. En Render, crear un Blueprint desde ese repositorio y revisar el servicio `cat-comunicaciones-preview` en plan Free.
3. Cuando Render solicite los valores secretos, ingresar `PREVIEW_ACCESS_PASSWORD`, `GOOGLE_CLIENT_ID`, `TRELLO_API_KEY` y `TRELLO_TOKEN`. No guardar esos valores en `render.yaml` ni en Git.
4. El usuario de la pantalla de contraseña será `cat`. La contraseña la elige el responsable del portal y se comparte con el grupo de revisión.
5. Al terminar el primer deploy, añadir el dominio `*.onrender.com` concreto a los orígenes JavaScript autorizados del cliente OAuth de Google. Probar el login institucional y crear una tarjeta de prueba en Trello.

Las solicitudes se guardarán en la lista `Nuevas solicitudes` del tablero `CAT Comunicaciones - Prueba`. El backend de esta versión crea tarjetas de Trello; todavía no envía la notificación de correo a Lorena.

El servicio Free se duerme tras 15 minutos sin tráfico y puede tardar cerca de un minuto en despertar. Es una vista previa para revisión, no un hosting de producción.
