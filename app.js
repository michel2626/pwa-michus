const products = [
	{ id: "amanecer", name: "Ramo Amanecer", category: "ramos", price: 680, tag: "Favorito", description: "Gerberas, rosas y un poquito de sol.", image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=900&q=82", alt: "Ramo de flores en tonos rosados y amarillos" },
	{ id: "silvestre", name: "Día Silvestre", category: "ramos", price: 540, tag: "De temporada", description: "Flores silvestres con aire de campo.", image: "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?auto=format&fit=crop&w=900&q=82", alt: "Ramo silvestre de flores frescas" },
	{ id: "jardin", name: "Jardín de Abril", category: "ramos", price: 790, tag: "Especial", description: "Una mezcla generosa, alegre y muy nuestra.", image: "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=900&q=82", alt: "Arreglo abundante de flores de colores" },
	{ id: "rositas", name: "Rositas para ti", category: "detalles", price: 390, tag: "Pequeño detalle", description: "Unas rosas bonitas para decir mucho.", image: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=900&q=82", alt: "Rosas rosadas recién cortadas" },
	{ id: "florero", name: "Florero Bonito", category: "detalles", price: 620, tag: "Listo para regalar", description: "Flores frescas en florero de vidrio.", image: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=900&q=82", alt: "Flores frescas arregladas en un florero" },
	{ id: "mini", name: "Mini alegría", category: "detalles", price: 320, tag: "Un apapacho", description: "Un ramito sencillo para alegrar el día.", image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?auto=format&fit=crop&w=900&q=82", alt: "Pequeño ramo de flores frescas" }
];

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const grid = document.querySelector("#product-grid");
const cart = new Map();
let activeFilter = "todos";
let deferredInstallPrompt;
let toastTimer;

function renderProducts() {
	const query = document.querySelector("#search-input").value.trim().toLocaleLowerCase("es-MX");
	const visible = products.filter((product) => {
		const matchesFilter = activeFilter === "todos" || product.category === activeFilter;
		const matchesQuery = `${product.name} ${product.description} ${product.tag}`.toLocaleLowerCase("es-MX").includes(query);
		return matchesFilter && matchesQuery;
	});
	grid.innerHTML = visible.map((product, index) => `
		<article class="product" style="--item-index:${index}">
			<div class="product-image"><img src="${product.image}" alt="${product.alt}" loading="lazy" /><span class="product-tag">${product.tag}</span>
				<button class="add-button" type="button" data-add="${product.id}" aria-label="Añadir ${product.name} al pedido" title="Añadir al pedido">+</button>
			</div>
			<div class="product-meta"><div><h3>${product.name}</h3><p>${product.description}</p></div><strong>${money.format(product.price)}</strong></div>
		</article>`).join("");
	document.querySelector("#empty-state").hidden = visible.length > 0;
}

function updateCart() {
	const count = [...cart.values()].reduce((sum, item) => sum + item.quantity, 0);
	const items = [...cart.values()];
	document.querySelector("#cart-count").textContent = count;
	document.querySelector("#cart-items").innerHTML = items.map(({ product, quantity }) => `
		<article class="cart-item"><img src="${product.image}" alt="" /><div class="cart-item-info"><strong>${product.name}</strong><span>${money.format(product.price)}</span>
			<div class="quantity-controls"><button type="button" data-quantity="${product.id}" data-change="-1" aria-label="Quitar una unidad">−</button><span>${quantity}</span><button type="button" data-quantity="${product.id}" data-change="1" aria-label="Añadir una unidad">+</button></div>
		</div><button class="remove-item" type="button" data-remove="${product.id}" aria-label="Quitar ${product.name}">×</button></article>`).join("");
	const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
	document.querySelector("#cart-total").textContent = money.format(total);
	document.querySelector("#cart-empty").hidden = count > 0;
	document.querySelector("#checkout-form").hidden = count === 0;
}

function showToast(message) {
	const toast = document.querySelector("#toast");
	toast.textContent = message;
	toast.classList.add("visible");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

function setDrawer(open) {
	const drawer = document.querySelector("#cart-drawer");
	drawer.classList.toggle("open", open);
	drawer.setAttribute("aria-hidden", String(!open));
	document.querySelector("#drawer-backdrop").hidden = !open;
	document.body.classList.toggle("drawer-open", open);
	if (open) document.querySelector("#cart-close").focus();
}

function updateConnection() {
	const status = document.querySelector("#connection-status");
	status.classList.toggle("offline", !navigator.onLine);
	status.innerHTML = `<i></i> ${navigator.onLine ? "En línea" : "Sin conexión"}`;
}

function openDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("flor-de-abril", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("orders", { keyPath: "id" });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function savePendingOffline(record) {
	const database = await openDatabase();
	await new Promise((resolve, reject) => {
		const transaction = database.transaction("orders", "readwrite");
		transaction.objectStore("orders").put(record);
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error);
	});
	database.close();
}

async function registerSync() {
	const registration = await navigator.serviceWorker?.ready;
	if (registration && "sync" in registration) {
		try { await registration.sync.register("mi-primer-sync"); } catch { /* El evento online hará un nuevo intento. */ }
	}
}

async function submitOrder(order) {
	try {
		const response = await fetch("/api/orders", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(order)
		});
		if (!response.ok) throw new Error("No se pudo confirmar el pedido");
		showToast("¡Pedido recibido! El taller te contactará pronto.");
		notify("Pedido recibido", "Gracias por elegir flores de abril. Pronto nos pondremos en contacto.");
		return true;
	} catch {
		await savePendingOffline(order);
		await registerSync();
		showToast("Pedido guardado. Se enviará cuando vuelva la conexión.");
		notify("Pedido guardado sin conexión", "Lo enviaremos al taller en cuanto recuperes la conexión.");
		return false;
	}
}

async function syncOrders() {
	if (!navigator.onLine || !("serviceWorker" in navigator)) return;
	const registration = await navigator.serviceWorker.ready;
	const worker = registration.active;
	if (!worker) return;
	const database = await openDatabase();
	const orders = await new Promise((resolve, reject) => {
		const request = database.transaction("orders").objectStore("orders").getAll();
		request.onsuccess = () => resolve(request.result.filter((record) => record.type !== "contact"));
		request.onerror = () => reject(request.error);
	});
	database.close();
	if (orders.length) worker.postMessage({ type: "SYNC_ORDERS", orders });
}

async function deletePendingRecord(id) {
	const database = await openDatabase();
	await new Promise((resolve, reject) => {
		const transaction = database.transaction("orders", "readwrite");
		transaction.objectStore("orders").delete(id);
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error);
	});
	database.close();
}

async function syncPendingContacts() {
	if (!navigator.onLine) return;
	const registration = await navigator.serviceWorker.ready;
	registration.active?.postMessage({ type: "SYNC_CONTACTS_LOCAL" });
}

function notify(title, body, url = "/#catalogo") {
	if ("Notification" in window && Notification.permission === "granted") {
		navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, {
			body,
			icon: "/icons/flor-192.png",
			badge: "/icons/flor-192.png",
			tag: "flor-de-abril",
			data: { url }
		})).catch(() => {});
	}
}

function setContactDeliveryStatus(state) {
	const status = document.querySelector("#contact-delivery-status");
	const states = {
		pending: { className: "pending", icon: "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>" , text: "En espera: se sincronizará al recuperar conexión." },
		sent: { className: "sent", icon: "<path d='m5 12 4 4L19 6'/>" , text: "Sincronizado en este dispositivo." }
	};
	const current = states[state];
	status.className = `contact-status ${current.className}`;
	status.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${current.icon}</svg><span>${current.text}</span>`;
	status.hidden = false;
}

async function restorePendingContactStatus() {
	const database = await openDatabase();
	const pending = await new Promise((resolve, reject) => {
		const request = database.transaction("orders").objectStore("orders").getAll();
		request.onsuccess = () => resolve(request.result.some((record) => record.type === "contact"));
		request.onerror = () => reject(request.error);
	});
	database.close();
	if (pending) setContactDeliveryStatus("pending");
}

document.querySelector(".filters").addEventListener("click", (event) => {
	const button = event.target.closest("[data-filter]");
	if (!button) return;
	activeFilter = button.dataset.filter;
	document.querySelectorAll(".filter-button").forEach((filter) => filter.classList.toggle("active", filter === button));
	renderProducts();
});

document.querySelector("#search-input").addEventListener("input", renderProducts);
grid.addEventListener("click", (event) => {
	const button = event.target.closest("[data-add]");
	if (!button) return;
	const product = products.find((item) => item.id === button.dataset.add);
	const item = cart.get(product.id) || { product, quantity: 0 };
	item.quantity += 1;
	cart.set(product.id, item);
	updateCart();
	button.classList.add("added");
	setTimeout(() => button.classList.remove("added"), 500);
	showToast(`${product.name} se añadió a tu pedido.`);
});

document.querySelector("#cart-items").addEventListener("click", (event) => {
	const quantityButton = event.target.closest("[data-quantity]");
	const removeButton = event.target.closest("[data-remove]");
	if (removeButton) cart.delete(removeButton.dataset.remove);
	if (quantityButton) {
		const item = cart.get(quantityButton.dataset.quantity);
		item.quantity += Number(quantityButton.dataset.change);
		if (item.quantity <= 0) cart.delete(item.product.id);
	}
	updateCart();
});

document.querySelector("#cart-toggle").addEventListener("click", () => setDrawer(true));
document.querySelector("#cart-close").addEventListener("click", () => setDrawer(false));
document.querySelector("#drawer-backdrop").addEventListener("click", () => setDrawer(false));
document.querySelector("#browse-button").addEventListener("click", () => { setDrawer(false); document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth" }); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setDrawer(false); });

document.querySelector("#checkout-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const submitButton = form.querySelector("[type=submit]");
	submitButton.disabled = true;
	const data = new FormData(form);
	const order = {
		id: crypto.randomUUID(),
		customer: { name: data.get("name"), phone: data.get("phone"), note: data.get("note") },
		items: [...cart.values()].map(({ product, quantity }) => ({ id: product.id, name: product.name, price: product.price, quantity })),
		createdAt: new Date().toISOString()
	};
	try {
		await submitOrder(order);
		cart.clear();
		form.reset();
		updateCart();
		setDrawer(false);
	} catch {
		showToast("No pudimos guardar el pedido. Intenta de nuevo.");
	} finally {
		submitButton.disabled = false;
	}
});

document.querySelector("#contact-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const submitButton = form.querySelector("[type=submit]");
	document.querySelector("#contact-delivery-status").hidden = true;
	const data = new FormData(form);
	const message = {
		id: crypto.randomUUID(),
		type: "contact",
		message: data.get("message"),
		createdAt: new Date().toISOString()
	};
	submitButton.disabled = true;
	try {
		await savePendingOffline(message);
		if (navigator.onLine) {
			await syncPendingContacts();
			showToast("Mensaje guardado. Sincronizando localmente…");
		} else {
			await registerSync();
			setContactDeliveryStatus("pending");
			showToast("Mensaje guardado. Se sincronizará al recuperar conexión.");
		}
		form.reset();
	} catch {
		showToast("No se pudo guardar el mensaje en este dispositivo.");
	} finally {
		submitButton.disabled = false;
	}
});

document.querySelector("#notification-button").addEventListener("click", async () => {
	if (!("Notification" in window)) return showToast("Este navegador no admite notificaciones.");
	const permission = await Notification.requestPermission();
	if (permission === "granted") {
		showToast("¡Listo! Te avisaremos sobre tus pedidos.");
		notify("Notificaciones activadas", "Te avisaremos cuando haya novedades de tus flores.");
	} else showToast("Puedes activar las notificaciones desde los ajustes del navegador.");
});

window.addEventListener("beforeinstallprompt", (event) => {
	event.preventDefault();
	deferredInstallPrompt = event;
	document.querySelector("#install-button").hidden = false;
});
document.querySelector("#install-button").addEventListener("click", async () => {
	if (!deferredInstallPrompt) return;
	deferredInstallPrompt.prompt();
	await deferredInstallPrompt.userChoice;
	deferredInstallPrompt = null;
	document.querySelector("#install-button").hidden = true;
});

window.addEventListener("online", () => {
	updateConnection();
	syncPendingContacts().catch(() => {});
	syncOrders().catch(() => {});
	showToast("Conexión recuperada. Enviando mensajes pendientes…");
});
window.addEventListener("offline", updateConnection);
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js").then(() => {
		syncOrders();
		syncPendingContacts().catch(() => {});
	}).catch(() => showToast("No se pudo activar el modo sin conexión."));
	navigator.serviceWorker.addEventListener("message", async (event) => {
		if (event.data?.type === "CONTACTS_SYNCED") {
			setContactDeliveryStatus("sent");
			showToast("Mensaje sincronizado en este dispositivo.");
			return;
		}
		if (event.data?.type !== "ORDERS_SYNCED") return;
		const database = await openDatabase();
		await new Promise((resolve, reject) => {
			const transaction = database.transaction("orders", "readwrite");
			(event.data.ids || []).forEach((id) => transaction.objectStore("orders").delete(id));
			transaction.oncomplete = resolve;
			transaction.onerror = () => reject(transaction.error);
		});
		database.close();
		const syncedContact = event.data.records?.some((record) => record.type === "contact");
		const syncedOrder = event.data.records?.some((record) => record.type !== "contact");
		if (syncedContact) {
			setContactDeliveryStatus("sent");
			showToast("¡Mensaje enviado al taller!");
		}
		if (syncedOrder) {
			showToast("¡Pedido enviado al taller!");
		}
	});
}

document.querySelector("#year").textContent = new Date().getFullYear();
updateConnection();
renderProducts();
restorePendingContactStatus().catch(() => {});
