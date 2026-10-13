const CACHE_NAME = "flor-de-abril-v4";
const APP_SHELL = ["/", "/index.html", "/styles.css", "/contact.css", "/app.js", "/manifest.webmanifest", "/icons/flor.svg", "/icons/flor-192.png", "/icons/flor-512.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;
	if (request.destination === "image") {
		event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
			const cached = await cache.match(request);
			if (cached) return cached;
			try {
				const response = await fetch(request);
				if (response.ok || response.type === "opaque") cache.put(request, response.clone());
				return response;
			} catch {
				return new Response("", { status: 503, statusText: "Offline" });
			}
		}));
		return;
	}
	event.respondWith(fetch(request).then((response) => {
		if (response.ok && url.origin === self.location.origin) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
		return response;
	}).catch(async () => {
		const cached = await caches.match(request);
		return cached || caches.match("/index.html");
	}));
});

self.addEventListener("sync", (event) => {
	if (event.tag === "mi-primer-sync") event.waitUntil(syncPendingContactsLocally());
	if (event.tag === "sync-orders") event.waitUntil(syncPendingOrders());
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SYNC_ORDERS") event.waitUntil(syncOrders(event.data.orders));
	if (event.data?.type === "SYNC_CONTACTS_LOCAL") event.waitUntil(syncPendingContactsLocally());
});

async function syncOrders(orders) {
	const synced = [];
	let retry = false;
	for (const record of orders.filter((record) => record.type !== "contact")) {
		try {
			const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
			if (response.ok || response.status === 409) synced.push({ id: record.id, type: record.type || "order" });
			else {
				retry = true;
				break;
			}
		} catch {
			retry = true;
			break;
		}
	}
	if (synced.length) {
		const database = await openOrdersDatabase();
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("orders", "readwrite");
			synced.forEach((record) => transaction.objectStore("orders").delete(record.id));
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
		database.close();
		const contactCount = synced.filter((record) => record.type === "contact").length;
		const orderCount = synced.length - contactCount;
		if (contactCount) {
			await self.registration.showNotification("Mensaje enviado", {
				body: "Tu mensaje ya llegó al taller de flores.",
				icon: "/icons/flor-192.png",
				badge: "/icons/flor-192.png",
				tag: "flor-de-abril-contacto",
				data: { url: "/#escribenos" }
			});
		}
		if (orderCount) {
			await self.registration.showNotification("Pedido enviado", {
				body: "Tu pedido ya llegó al taller de flores.",
				icon: "/icons/flor-192.png",
				badge: "/icons/flor-192.png",
				tag: "flor-de-abril-pedido",
				data: { url: "/#catalogo" }
			});
		}
		const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
		clients.forEach((client) => client.postMessage({ type: "ORDERS_SYNCED", ids: synced.map((record) => record.id), records: synced }));
	}
	if (retry) throw new Error("La sincronización no pudo completarse.");
}

function openOrdersDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("flor-de-abril", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("orders", { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function syncPendingOrders() {
	const database = await openOrdersDatabase();
	const orders = await new Promise((resolve, reject) => {
		const request = database.transaction("orders").objectStore("orders").getAll();
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	database.close();
	if (orders.length) await syncOrders(orders);
}

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});

async function syncPendingContactsLocally() {
	if (!self.navigator.onLine) return;
	const database = await openOrdersDatabase();
	const contacts = await new Promise((resolve, reject) => {
		const request = database.transaction("orders").objectStore("orders").getAll();
		request.onsuccess = () => resolve(request.result.filter((record) => record.type === "contact"));
		request.onerror = () => reject(request.error);
	});
	if (!contacts.length) {
		database.close();
		return;
	}
	await new Promise((resolve, reject) => {
		const transaction = database.transaction("orders", "readwrite");
		contacts.forEach((record) => transaction.objectStore("orders").delete(record.id));
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error);
	});
	database.close();
	const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
	clients.forEach((client) => client.postMessage({ type: "CONTACTS_SYNCED", ids: contacts.map((record) => record.id) }));
}
