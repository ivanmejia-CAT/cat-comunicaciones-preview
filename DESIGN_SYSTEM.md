# CAT Comunicaciones — Design System v1

## Fuente visual

El sistema parte del portal CAT actual y de la referencia del Portal de Personal y Eventos: interfaz clara, azul institucional y rojo para la acción de solicitud, con fondos neutros y acentos de estado. Manrope se reserva para títulos y cifras; DM Sans para lectura, formularios y controles.

## Organización prevista en Figma

1. **CAT · Foundations** — colecciones `CAT / Primitive` y `CAT / Semantic`, estilos de texto y efectos.
2. **CAT · Components** — componentes y estados reutilizables.
3. **CAT · Screens** — pantallas actuales del portal; sus colores y medidas se enlazan a variables semánticas.
4. **CAT · Usage** — guía de uso, contenido y accesibilidad.

## Inventario de componentes v1

- Button: primary, request, secondary, tertiary y destructive; default, hover, focus, disabled y loading.
- Text field, select, textarea y file/link input: default, focus, error, disabled y read-only.
- Card: service, project, deadline, status y portfolio.
- Status badge: recibida, falta información, en producción, en revisión, entregada y cancelada.
- Project progress: barra por etapas vinculada a los mismos colores de estado.
- Navigation item: default, active y collapsed.
- Filter chip, avatar, empty state, alert y success message.

## Tokens portables

`design-system.tokens.json` guarda los tokens en formato DTCG con valores semánticos aliasados a los primitivos. La colección semántica evita que cada componente dependa directamente del valor hexadecimal y permite cambiar el tema CAT en un solo lugar.

## Notas para integrar en Figma

Las cuatro pantallas capturadas son capas editables, pero no componentes nativos y actualmente no están vinculadas a variables. Para que una modificación global las actualice, hay que crear las variables/estilos, aplicar los enlaces a las pantallas y construir los componentes como instancias. La escritura automatizada a Figma quedó pendiente porque el servicio MCP reportó que se alcanzó el límite de llamadas del asiento View de la cuenta conectada.
