import { PLANTS_DB } from './database.js';

export let cart = JSON.parse(localStorage.getItem("viverodulcinea_cart")) || JSON.parse(localStorage.getItem("viveroweb_cart")) || [];

let cartToggleBtn, cartCloseBtn, cartSidePanel, cartPanelOverlay, cartItemsContainer, cartTotalPriceEl, cartBadgeCountEl, checkoutBtn;

export function initCart() {
  cartToggleBtn = document.getElementById("cart-toggle-btn");
  cartCloseBtn = document.getElementById("cart-close-btn");
  cartSidePanel = document.getElementById("cart-side-panel");
  cartPanelOverlay = document.getElementById("cart-panel-overlay");
  cartItemsContainer = document.getElementById("cart-items-container");
  cartTotalPriceEl = document.getElementById("cart-total-price");
  cartBadgeCountEl = document.getElementById("cart-badge-count");
  checkoutBtn = document.getElementById("checkout-btn");

  cartToggleBtn.addEventListener("click", openCartPanel);
  cartCloseBtn.addEventListener("click", closeCartPanel);
  cartPanelOverlay.addEventListener("click", closeCartPanel);

  checkoutBtn.addEventListener("click", handleCheckout);

  updateCartUI();
}

export function openCartPanel() {
  cartSidePanel.classList.add("open");
  cartPanelOverlay.classList.add("open");
}

export function closeCartPanel() {
  cartSidePanel.classList.remove("open");
  cartPanelOverlay.classList.remove("open");
}

export function addToCart(plantId) {
  const plant = PLANTS_DB.find(p => p.id === plantId);
  if (!plant) return;

  const existingItem = cart.find(item => item.id === plantId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    const hasPromo = plant.discount > 0;
    const finalPrice = hasPromo ? plant.price * (1 - plant.discount / 100) : plant.price;
    cart.push({
      id: plant.id,
      name: plant.name,
      price: finalPrice,
      image: plant.image,
      quantity: 1
    });
  }

  saveCart();
  updateCartUI();
  openCartPanel();
  
  // Quick micro-animation feedback on cart icon
  cartToggleBtn.classList.add("cart-added-animate");
  setTimeout(() => cartToggleBtn.classList.remove("cart-added-animate"), 500);
}

export function updateCartUI() {
  if (!cartItemsContainer) return;
  
  cartItemsContainer.innerHTML = "";
  let total = 0;
  let itemCount = 0;

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `<div class="cart-empty-msg">Tu carrito está vacío. ¡Explora nuestro catálogo!</div>`;
    cartTotalPriceEl.textContent = "$0.00";
    cartBadgeCountEl.textContent = "0";
    return;
  }

  cart.forEach(item => {
    total += item.price * item.quantity;
    itemCount += item.quantity;

    const cartItem = document.createElement("div");
    cartItem.className = "cart-item";
    cartItem.innerHTML = `
      <img src="${item.image}" alt="${item.name}" class="cart-item-img">
      <div class="cart-item-details">
        <h4>${item.name}</h4>
        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn dec-qty" data-id="${item.id}">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn inc-qty" data-id="${item.id}">+</button>
        </div>
      </div>
      <button class="remove-item-btn" data-id="${item.id}" aria-label="Eliminar artículo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    cartItem.querySelector(".inc-qty").addEventListener("click", () => {
      changeQuantity(item.id, 1);
    });

    cartItem.querySelector(".dec-qty").addEventListener("click", () => {
      changeQuantity(item.id, -1);
    });

    cartItem.querySelector(".remove-item-btn").addEventListener("click", () => {
      removeFromCart(item.id);
    });

    cartItemsContainer.appendChild(cartItem);
  });

  cartTotalPriceEl.textContent = `$${total.toFixed(2)}`;
  cartBadgeCountEl.textContent = itemCount;
}

function changeQuantity(id, amount) {
  const item = cart.find(item => item.id === id);
  if (!item) return;

  item.quantity += amount;
  if (item.quantity <= 0) {
    removeFromCart(id);
    return;
  }

  saveCart();
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem("viverodulcinea_cart", JSON.stringify(cart));
}

function handleCheckout() {
  if (cart.length === 0) return;
  
  // Deduct stock in database and save
  const savedStocks = JSON.parse(localStorage.getItem("viveroweb_stocks")) || {};
  cart.forEach(item => {
    const plant = PLANTS_DB.find(p => p.id === item.id);
    if (plant) {
      plant.stock = Math.max(0, plant.stock - item.quantity);
      savedStocks[plant.id] = plant.stock;
    }
  });
  localStorage.setItem("viveroweb_stocks", JSON.stringify(savedStocks));

  let total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const newOrder = {
    id: "VW-" + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleString("es-ES", { hour12: false }),
    items: cart.map(item => `${item.name} (x${item.quantity})`).join(", "),
    total: total,
    status: "Completado"
  };
  
  const orders = JSON.parse(localStorage.getItem("viveroweb_orders")) || [];
  orders.unshift(newOrder);
  localStorage.setItem("viveroweb_orders", JSON.stringify(orders));
  
  alert("¡Muchas gracias por simular tu pedido en Vivero Dulcinea! El pedido ha sido registrado con éxito. Si entras como Gerente, ahora podrás verlo en tu panel de control.");
  
  cart = [];
  saveCart();
  updateCartUI();
  closeCartPanel();
  
  // Decoupled notification of new order
  document.dispatchEvent(new CustomEvent("order-placed", { detail: newOrder }));
}
