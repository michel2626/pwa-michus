# Flor de Abril

PWA sencilla de catálogo y pedidos, con caché offline, icono propio, instalación y cola de pedidos con sincronización cuando vuelve la conexión.

## Iniciar el servidor

Requiere Node.js 18 o posterior. Desde esta carpeta ejecuta:

```powershell
node server.js
```

Abre http://localhost:4173. Los pedidos recibidos se guardan localmente en `data/orders.json` y los mensajes del formulario en `data/messages.json`.

Para cambiar el puerto en PowerShell:

```powershell
$env:PORT=5000; node server.js
```

La instalación y las funciones de service worker requieren localhost o HTTPS. La sincronización en segundo plano depende del soporte del navegador; en navegadores sin Background Sync, los pedidos pendientes se reintentan al abrir la app o recuperar conexión.
