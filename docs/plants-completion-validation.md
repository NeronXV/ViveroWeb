# Confirmación de fichas existentes

El asistente consulta la ficha y su revisión antes de permitir editarla. Si se
sube una fotografía, la confirmación usa la revisión obtenida después de esa
subida. La confirmación exitosa permite salir sin descartar cambios, incluso
si el servidor normaliza campos como el precio.

«Por completar» corresponde a la preparación comercial informada por la API.
Las tarjetas y el asistente muestran los requisitos pendientes de esa sucursal.
Editar una ficha existente no modifica existencias. El alta nueva de gerente,
administrador o dueño puede incluir cantidad inicial y precio para habilitarla
directamente, conforme al permiso que devuelve el backend.

Validación local: pruebas de Plantas, lint y build; el recorrido
`node tests/plants-completion-browser.mjs` abre una ficha pendiente, confirma
con y sin foto, vuelve sin aviso de descarte y comprueba el filtro de pendientes.
Requiere `BROWSER_TEST_MODULES` apuntando al runtime existente con Playwright.
Usa HTTP ficticio en loopback, cierra navegador/servidor y bloquea otros orígenes.
No acredita despliegue, datos reales ni captura física de cámara.
