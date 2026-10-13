const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const PORT = Number(process.env.PORT || 4173);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};
const CATALOG = new Map([
  ["amanecer", { name: "Ramo Amanecer", price: 680 }],
  ["silvestre", { name: "Día Silvestre", price: 540 }],
  ["jardin", { name: "Jardín de Abril", price: 790 }],
  ["rositas", { name: "Rositas para ti", price: 390 }],
  ["florero", { name: "Florero Bonito", price: 620 }],
  ["mini", { name: "Mini alegría", price: 320 }]
]);

async function readOrders() {
  try {
    return JSON.parse(await fs.readFile(ORDERS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readMessages() {
  try {
    return JSON.parse(await fs.readFile(MESSAGES_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_000) throw Object.assign(new Error("El pedido es demasiado grande."), { status: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("El pedido no tiene un formato válido."), { status: 400 });
  }
}

function validateOrder(order) {
  if (!order || typeof order !== "object" || !order.customer || !Array.isArray(order.items) || order.items.length < 1 || order.items.length > 12) {
    throw Object.assign(new Error("Faltan los datos del pedido."), { status: 400 });
  }
  const name = String(order.customer.name || "").trim();
  const phone = String(order.customer.phone || "").trim();
  if (!name || name.length > 70 || !phone || phone.length > 24) {
    throw Object.assign(new Error("Revisa tu nombre y teléfono de contacto."), { status: 400 });
  }
  const items = order.items.map((item) => {
    const product = CATALOG.get(item.id);
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw Object.assign(new Error("Hay un arreglo o una cantidad no válida."), { status: 400 });
    }
    return { id: item.id, name: product.name, price: product.price, quantity };
  });
  return {
    id: typeof order.id === "string" && order.id.length <= 80 ? order.id : randomUUID(),
    customer: { name, phone, note: String(order.customer.note || "").slice(0, 240) },
    items,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    createdAt: new Date().toISOString(),
    status: "recibido"
  };
}

function validateContact(message) {
    const text = String(message?.message || "").trim();
    if (!text || text.length > 1000) {
      throw Object.assign(new Error("Escribe un mensaje de hasta 1000 caracteres."), { status: 400 });
    }
    return {
      id: typeof message.id === "string" && message.id.length <= 80 ? message.id : randomUUID(),
      message: text,
      createdAt: new Date().toISOString(),
      status: "recibido"
    };
}

async function handleApi(request, response) {
  const endpoint = request.url.split("?")[0];
  if (request.method !== "POST" || !["/api/orders", "/api/messages"].includes(endpoint)) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Ruta no encontrada." }));
    return;
  }
  try {
    if (endpoint === "/api/messages") {
      const message = validateContact(await readRequestBody(request));
      const messages = await readMessages();
      const existing = messages.find((saved) => saved.id === message.id);
      if (existing) {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, duplicate: true, messageId: existing.id }));
        return;
      }
      messages.push(message);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(MESSAGES_FILE, `${JSON.stringify(messages, null, 2)}\n`, "utf8");
      response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, messageId: message.id }));
      return;
    }
    const order = validateOrder(await readRequestBody(request));
    const orders = await readOrders();
    const existing = orders.find((saved) => saved.id === order.id);
    if (existing) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, duplicate: true, orderId: existing.id }));
      return;
    }
    orders.push(order);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(ORDERS_FILE, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
    response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, orderId: order.id, total: order.total }));
  } catch (error) {
    response.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.status ? error.message : "No se pudo guardar el pedido." }));
  }
}

async function serveFile(request, response) {
  let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
  }
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    handleApi(request, response);
    return;
  }
  serveFile(request, response);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Flor de Abril disponible en http://localhost:${PORT}`);
});
