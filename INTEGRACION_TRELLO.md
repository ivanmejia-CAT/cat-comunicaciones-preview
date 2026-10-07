# Portal CAT: inicio de sesión y conexión con Trello

El formulario del portal crea una tarjeta en la lista de solicitudes configurada. El portal también permite iniciar sesión con Google Workspace `@cat.mx` y consultar únicamente las tarjetas cuyo campo `Correo CAT:` coincida con el correo verificado. El token de Trello se queda en el servidor, dentro de `.env`; nunca se envía al navegador.

## 1. Preparar Google Workspace

1. Abre [Google Cloud Console](https://console.cloud.google.com/) con una cuenta que pueda crear o configurar proyectos de Google Cloud.
2. Selecciona o crea un proyecto de Google Cloud.
3. En **Google Auth Platform / Pantalla de consentimiento**, configura el nombre de la aplicación. Si la opción está disponible para la organización del CAT, selecciona **Interno** para limitar el acceso a cuentas de la organización.
4. Ve a **Clientes** y crea un cliente OAuth de tipo **Aplicación web**.
5. En **Orígenes autorizados de JavaScript**, agrega `http://localhost:3000`.
6. Para este inicio de sesión con Google Identity Services no agregues una URL de redirección.
7. Copia el **ID de cliente** con terminación `apps.googleusercontent.com`. Es un identificador público; no compartas ni configures un secreto OAuth en el navegador.

> El servidor verifica la firma, vigencia, audiencia y dominio del token de Google. Aunque la pantalla de Google muestre otros dominios, solo acepta una cuenta verificada del dominio `cat.mx`.

## 2. Completar `.env`

Si todavía no existe, copia `.env.example` y nombra la copia `.env`. Como ya configuraste Trello para las pruebas, conserva ese archivo y agrega o actualiza las dos variables de Google y tablero. Completa los valores localmente:

```env
TRELLO_API_KEY=tu_api_key
TRELLO_TOKEN=tu_token
TRELLO_LIST_ID=6ac690bdaabae1197ab5e9d0
GOOGLE_CLIENT_ID=tu_cliente_id.apps.googleusercontent.com
TRELLO_BOARD_ID=6ac690bdaabae1197ab5e9ca
PORT=3000
```

El ID de lista y el ID del tablero de arriba corresponden al tablero de prueba **CAT Comunicaciones - Prueba**. Si cambias de tablero, usa los IDs del tablero y lista de destino. Conserva `.env` privado y no pegues aquí la API Key ni el token.

## 3. Instalar y arrancar

Desde una terminal abierta en la carpeta `outputs`, instala la dependencia nueva y luego arranca el servidor:

```bash
npm install
npm start
```

Abre `http://localhost:3000`. Cada vez que cambies `.env`, detén el servidor con `Ctrl+C` y vuelve a ejecutar `npm start`.

## 4. Recorrido de prueba

1. Inicia sesión con una cuenta institucional `@cat.mx`.
2. Abre **Solicitar un proyecto**. Tu nombre y correo se completan desde Google y no se pueden editar en el formulario.
3. Llena los datos del servicio y registra a la persona que verificó la información; la aprobación debe ocurrir antes de enviar.
4. Envía una solicitud y confirma que la tarjeta se creó en **Nuevas solicitudes**.
5. Confirma que Trello envió la notificación configurada a Lorena.
6. Abre **Mis proyectos**. Solo aparecerán las tarjetas del tablero que tengan exactamente tu correo en una línea como `Correo CAT: nombre@cat.mx` en su descripción. La pantalla consulta Trello cada 30 segundos mientras está abierta y también tiene un botón para actualizar en el momento.
7. Mueve una tarjeta entre listas en Trello. El portal reflejará el nuevo estado automáticamente en la siguiente consulta (hasta 30 segundos), o al pulsar **Actualizar**. Los solicitantes ven el estado; el equipo de Comunicaciones sigue moviendo las tarjetas desde Trello.

La consulta de proyectos usa las listas abiertas del tablero. La barra del portal sigue este mismo orden: **Nuevas solicitudes** se muestra como **Recibida**, seguido de **Falta información**, **En producción**, **En revisión** y **Entregadas**. Si agregas o renombras una lista en Trello, habrá que ajustar el mapeo para que aparezca como una etapa conocida.

## Notificación a Lorena

El servidor no manda correos. La notificación debe salir de la automatización de Trello ya configurada para la lista **Nuevas solicitudes** y el correo `lorena.salas@cat.mx`. No se manda una confirmación adicional al solicitante.

## Alcance actual

Esta configuración sirve para pruebas locales. Antes de publicar el portal para todo el personal, hay que alojar el servidor con HTTPS, actualizar los orígenes autorizados de Google al dominio definitivo y mantener las credenciales únicamente como variables secretas del servidor. El portafolio sigue siendo contenido de muestra por ahora; su conexión con Google Drive queda como siguiente integración.
