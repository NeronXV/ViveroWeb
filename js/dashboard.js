import { PLANTS_DB } from './database.js';

let staffList = JSON.parse(localStorage.getItem("viveroweb_staff")) || [
  { name: "Lucía Pérez", specialty: "Huerto y Frutales", shift: "Mañana", active: true },
  { name: "Carlos Ruiz", specialty: "Plantas de Sombra", shift: "Tarde", active: false },
  { name: "Marta Gómez", specialty: "Cactus y Suculentas", shift: "Mañana", active: true }
];

export function initDashboard() {
  const adminToggleBtn = document.getElementById("admin-toggle-btn");
  const loginModal = document.getElementById("login-modal");
  const dashboardPanel = document.getElementById("dashboard-panel");
  const dbOverlay = document.getElementById("db-panel-overlay");
  
  const closeLoginBtn = document.getElementById("close-login-btn");
  const closeDashboardBtn = document.getElementById("close-dashboard-btn");
  const dashboardLogoutBtn = document.getElementById("dashboard-logout-btn");
  
  const demoAdminBtn = document.getElementById("demo-admin-btn");
  const demoManagerBtn = document.getElementById("demo-manager-btn");
  const loginForm = document.getElementById("login-form");
  const loginErrorMsg = document.getElementById("login-error-msg");
  
  const sidebarItems = document.querySelectorAll(".db-nav-item");
  const tabContents = document.querySelectorAll(".db-tab-content");

  if (!adminToggleBtn) return;
  
  // Open / Close actions
  adminToggleBtn.addEventListener("click", () => {
    loginModal.classList.add("open");
    dbOverlay.classList.add("open");
  });
  
  const closeAllModals = () => {
    loginModal.classList.remove("open");
    dashboardPanel.classList.remove("open");
    dbOverlay.classList.remove("open");
    loginErrorMsg.style.display = "none";
    loginForm.reset();
  };
  
  closeLoginBtn.addEventListener("click", closeAllModals);
  closeDashboardBtn.addEventListener("click", closeAllModals);
  dbOverlay.addEventListener("click", closeAllModals);
  
  dashboardLogoutBtn.addEventListener("click", () => {
    closeAllModals();
    alert("Sesión cerrada correctamente.");
  });

  // Demo access
  demoAdminBtn.addEventListener("click", () => loginUser("admin"));
  demoManagerBtn.addEventListener("click", () => loginUser("gerente"));
  
  // Credentials submit
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("login-username").value.trim().toLowerCase();
    const pass = document.getElementById("login-password").value.trim();
    
    if ((user === "admin" && pass === "admin") || (user === "admin" && pass === "1234")) {
      loginUser("admin");
    } else if ((user === "gerente" && pass === "gerente") || (user === "gerente" && pass === "1234")) {
      loginUser("gerente");
    } else {
      loginErrorMsg.textContent = "Credenciales incorrectas. Prueba con admin/admin o gerente/gerente.";
      loginErrorMsg.style.display = "block";
    }
  });

  // Tab switching
  sidebarItems.forEach(item => {
    item.addEventListener("click", () => {
      const tabId = item.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Stock category filters click handlers
  const stockFilterBtns = document.querySelectorAll("#db-content-stock .filter-btn");
  stockFilterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      stockFilterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const category = btn.getAttribute("data-category");
      renderStockList(category);
    });
  });
  
  function switchTab(tabId) {
    sidebarItems.forEach(i => {
      if (i.getAttribute("data-tab") === tabId) {
        i.classList.add("active");
      } else {
        i.classList.remove("active");
      }
    });
    
    tabContents.forEach(c => {
      if (c.id === `db-content-${tabId}`) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });

    if (tabId === "stock") {
      // Re-activate "Todas" category filter button on tab open
      const stockFilterBtns = document.querySelectorAll("#db-content-stock .filter-btn");
      stockFilterBtns.forEach(btn => {
        if (btn.getAttribute("data-category") === "all") btn.classList.add("active");
        else btn.classList.remove("active");
      });
      renderStockList("all");
    }
  }

  // Login handler
  function loginUser(role) {
    loginModal.classList.remove("open");
    loginErrorMsg.style.display = "none";
    loginForm.reset();
    
    const roleBadge = document.getElementById("dashboard-role-badge");
    roleBadge.textContent = role === "admin" ? "Admin" : "Gerente";
    roleBadge.className = `role-badge-db ${role}`;
    
    // Sidebar tabs filter by role
    const adminTabs = ["tab-editorial-nav", "tab-inventario-nav", "tab-stock-nav", "tab-promociones-nav"];
    const managerTabs = ["tab-ventas-nav", "tab-pedidos-nav", "tab-personal-nav"];
    
    adminTabs.forEach(id => {
      document.getElementById(id).style.display = role === "admin" ? "block" : "none";
    });
    managerTabs.forEach(id => {
      document.getElementById(id).style.display = role === "gerente" ? "block" : "none";
    });
    
    const targetTab = role === "admin" ? "editorial" : "ventas";
    switchTab(targetTab);
    
    if (role === "admin") {
      loadEditorialForm();
      populatePromoSelect();
      renderActivePromos();
      renderStockList();
    } else {
      updateManagerDashboard();
    }
    
    dashboardPanel.classList.add("open");
  }

  // --- ADMIN MODULES ---
  
  function loadEditorialForm() {
    const config = JSON.parse(localStorage.getItem("viveroweb_editorial")) || {
      title: "Trae la armonía de la naturaleza a tu hogar",
      desc: "Descubre nuestra selecta colección de plantas de interior, exterior y variedades exóticas cultivadas con el mayor cuidado por expertos botánicos.",
      announcement: "Envíos premium a todo el país"
    };
    
    document.getElementById("hero-title-input").value = config.title;
    document.getElementById("hero-desc-input").value = config.desc;
    document.getElementById("announcement-input").value = config.announcement;
  }
  
  document.getElementById("editorial-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const config = {
      title: document.getElementById("hero-title-input").value.trim(),
      desc: document.getElementById("hero-desc-input").value.trim(),
      announcement: document.getElementById("announcement-input").value.trim()
    };
    localStorage.setItem("viveroweb_editorial", JSON.stringify(config));
    
    // Live update home view
    const titleEl = document.querySelector(".hero h1");
    const descEl = document.querySelector(".hero p");
    const badgeEl = document.querySelector(".hero-badge");
    
    if (titleEl) titleEl.textContent = config.title;
    if (descEl) descEl.textContent = config.desc;
    if (badgeEl) {
      badgeEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
        </svg>
        ${config.announcement}
      `;
    }
    
    alert("¡Diseño editorial y anuncios actualizados correctamente en la página de inicio!");
  });

  // Inventory additions
  document.getElementById("inventory-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("plant-name-input").value.trim();
    const category = document.getElementById("plant-category-select").value;
    const price = parseFloat(document.getElementById("plant-price-input").value);
    const image = document.getElementById("plant-image-select").value;
    const light = document.getElementById("plant-light-select").value;
    const water = document.getElementById("plant-water-select").value;
    const pets = document.getElementById("plant-pets-select").value;
    const desc = document.getElementById("plant-desc-input").value.trim();
    const stock = parseInt(document.getElementById("plant-stock-input").value) || 10;
    
    const lightDesc = light === "alta" ? "Sol directo" : light === "media" ? "Luz indirecta" : "Poca luz / Sombra";
    const waterDesc = water === "alta" ? "Riego frecuente" : "Poco riego";
    const petDesc = pets === "si" ? "Segura para mascotas" : "Tóxica para mascotas";
    
    const newId = PLANTS_DB.length > 0 ? Math.max(...PLANTS_DB.map(p => p.id)) + 1 : 1;
    
    const newPlant = {
      id: newId,
      name,
      category,
      price,
      light,
      water,
      pets,
      image,
      lightDesc,
      waterDesc,
      petDesc,
      desc,
      discount: 0,
      stock: stock
    };
    
    PLANTS_DB.push(newPlant);
    
    // Save to custom list
    const customPlants = JSON.parse(localStorage.getItem("viveroweb_custom_plants")) || [];
    customPlants.push(newPlant);
    localStorage.setItem("viveroweb_custom_plants", JSON.stringify(customPlants));
    
    // Save stock level in map
    const savedStocks = JSON.parse(localStorage.getItem("viveroweb_stocks")) || {};
    savedStocks[newId] = stock;
    localStorage.setItem("viveroweb_stocks", JSON.stringify(savedStocks));
    
    alert(`¡Planta "${name}" añadida con éxito al inventario!`);
    document.getElementById("inventory-form").reset();
    
    // Re-render and populate selectors
    document.dispatchEvent(new CustomEvent("catalog-updated"));
    populatePromoSelect();
    renderStockList();
  });

  // Promotions controls
  function populatePromoSelect() {
    const select = document.getElementById("promo-plant-select");
    if (!select) return;
    select.innerHTML = "";
    PLANTS_DB.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.name} ($${p.price.toFixed(2)})`;
      select.appendChild(opt);
    });
  }

  document.getElementById("promotions-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const plantId = parseInt(document.getElementById("promo-plant-select").value);
    const discount = parseInt(document.getElementById("promo-discount-input").value);
    
    const plant = PLANTS_DB.find(p => p.id === plantId);
    if (plant) {
      plant.discount = discount;
      
      const promos = JSON.parse(localStorage.getItem("viveroweb_promotions")) || {};
      promos[plantId] = discount;
      localStorage.setItem("viveroweb_promotions", JSON.stringify(promos));
      
      alert(`Descuento de ${discount}% aplicado correctamente a "${plant.name}".`);
      document.getElementById("promo-discount-input").value = "";
      
      renderActivePromos();
      
      // Update catalog
      document.dispatchEvent(new CustomEvent("catalog-updated"));
    }
  });

  function renderActivePromos() {
    const list = document.getElementById("active-promos-list");
    if (!list) return;
    list.innerHTML = "";
    
    const promoPlants = PLANTS_DB.filter(p => p.discount > 0);
    if (promoPlants.length === 0) {
      list.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No hay descuentos activos.</td></tr>`;
      return;
    }
    
    promoPlants.forEach(p => {
      const finalPrice = p.price * (1 - p.discount / 100);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${p.name}</strong></td>
        <td>$${p.price.toFixed(2)}</td>
        <td><span class="db-badge warning">${p.discount}% OFF</span></td>
        <td><strong>$${finalPrice.toFixed(2)}</strong></td>
        <td><button class="staff-action-btn remove-promo-btn" data-id="${p.id}">Eliminar</button></td>
      `;
      
      tr.querySelector(".remove-promo-btn").addEventListener("click", () => {
        p.discount = 0;
        const promos = JSON.parse(localStorage.getItem("viveroweb_promotions")) || {};
        delete promos[p.id];
        localStorage.setItem("viveroweb_promotions", JSON.stringify(promos));
        renderActivePromos();
        
        // Update catalog
        document.dispatchEvent(new CustomEvent("catalog-updated"));
      });
      
      list.appendChild(tr);
    });
  }

  // --- Decoupled listener for cart checkout orders ---
  document.addEventListener("order-placed", () => {
    if (dashboardPanel.classList.contains("open")) {
      updateManagerDashboard();
      
      const activeStockFilter = document.querySelector("#db-content-stock .filter-btn.active");
      const currentCategory = activeStockFilter ? activeStockFilter.getAttribute("data-category") : "all";
      renderStockList(currentCategory);
    }
  });
}

// --- MANAGER MODULES ---

export function updateManagerDashboard() {
  const orders = JSON.parse(localStorage.getItem("viveroweb_orders")) || [];
  
  // Tally stats
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
  document.getElementById("stat-revenue").textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById("stat-orders").textContent = totalOrders;
  document.getElementById("stat-ticket").textContent = `$${avgTicket.toFixed(2)}`;
  
  // Popularity bars
  let intCount = 0, extCount = 0, sucCount = 0;
  orders.forEach(order => {
    PLANTS_DB.forEach(plant => {
      if (order.items.toLowerCase().includes(plant.name.toLowerCase())) {
        if (plant.category === "interior") intCount++;
        else if (plant.category === "exterior") extCount++;
        else if (plant.category === "suculentas") sucCount++;
      }
    });
  });
  
  const baseInt = 6 + intCount;
  const baseExt = 4 + extCount;
  const baseSuc = 5 + sucCount;
  const sumTotal = baseInt + baseExt + baseSuc;
  
  const intPercent = Math.round((baseInt / sumTotal) * 100);
  const extPercent = Math.round((baseExt / sumTotal) * 100);
  const sucPercent = Math.round((baseSuc / sumTotal) * 100);
  
  document.getElementById("bar-interior").style.width = `${intPercent}%`;
  document.getElementById("val-interior").textContent = `${intPercent}%`;
  
  document.getElementById("bar-exterior").style.width = `${extPercent}%`;
  document.getElementById("val-exterior").textContent = `${extPercent}%`;
  
  document.getElementById("bar-suculentas").style.width = `${sucPercent}%`;
  document.getElementById("val-suculentas").textContent = `${sucPercent}%`;
  
  // Orders history
  renderOrdersLog(orders);
  
  // Staff shifts
  renderStaffList();
}

function renderOrdersLog(orders) {
  const list = document.getElementById("orders-log-list");
  if (!list) return;
  list.innerHTML = "";
  
  if (orders.length === 0) {
    list.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No hay pedidos en la lista de hoy. Simula compras en la tienda para verlos.</td></tr>`;
    return;
  }
  
  orders.forEach(o => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${o.id}</strong></td>
      <td style="font-size: 0.85rem; color: var(--text-secondary);">${o.date}</td>
      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${o.items}">${o.items}</td>
      <td><strong>$${o.total.toFixed(2)}</strong></td>
      <td><span class="db-badge success">${o.status}</span></td>
    `;
    list.appendChild(tr);
  });
}

function renderStaffList() {
  const list = document.getElementById("staff-list");
  if (!list) return;
  list.innerHTML = "";
  
  staffList.forEach((member, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${member.name}</strong></td>
      <td>${member.specialty}</td>
      <td>${member.shift}</td>
      <td>
        <span class="db-badge ${member.active ? 'success' : 'info'}">
          ${member.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <button class="staff-action-btn toggle-staff-btn" data-idx="${idx}">
          Alternar Turno
        </button>
      </td>
    `;
    
    tr.querySelector(".toggle-staff-btn").addEventListener("click", () => {
      member.active = !member.active;
      localStorage.setItem("viveroweb_staff", JSON.stringify(staffList));
      renderStaffList();
    });
    
    list.appendChild(tr);
  });
}

export function renderStockList(category = "all") {
  const stockGrid = document.getElementById("db-stock-grid");
  if (!stockGrid) return;
  
  stockGrid.innerHTML = "";
  
  let filtered = PLANTS_DB;
  if (category !== "all") {
    filtered = filtered.filter(p => p.category === category);
  }
  
  if (filtered.length === 0) {
    stockGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); margin: 2rem 0;">No se encontraron plantas en esta categoría.</div>`;
    return;
  }
  
  filtered.forEach(plant => {
    // Determine status level
    let statusClass = "adequate";
    let statusBadgeText = `🟢 Adecuado`;
    
    if (plant.stock <= 1) {
      statusClass = "critical";
      statusBadgeText = plant.stock === 0 ? "🔴 Agotada" : `🔴 Crítico`;
    } else if (plant.stock <= 4) {
      statusClass = "low";
      statusBadgeText = `🟡 Bajo`;
    }
    
    const card = document.createElement("div");
    card.className = `stock-card ${statusClass}`;
    card.innerHTML = `
      <div class="stock-card-image-container">
        <img src="${plant.image}" alt="${plant.name}" class="stock-card-img-large">
        <span class="stock-badge-floating">${statusBadgeText}</span>
      </div>
      <div class="stock-card-body">
        <h4>${plant.name}</h4>
        <p class="stock-card-category">${plant.category.charAt(0).toUpperCase() + plant.category.slice(1)}</p>
        <div class="stock-level-indicator">
          <span>Existencias:</span>
          <span class="stock-qty-value">${plant.stock} unidades</span>
        </div>
        <div class="stock-action-group">
          <button class="stock-btn add-5-stock" data-id="${plant.id}">+5 u.</button>
          <button class="stock-btn add-10-stock" data-id="${plant.id}">+10 u.</button>
        </div>
      </div>
    `;
    
    card.querySelector(".add-5-stock").addEventListener("click", () => {
      restockPlant(plant.id, 5);
    });
    
    card.querySelector(".add-10-stock").addEventListener("click", () => {
      restockPlant(plant.id, 10);
    });
    
    stockGrid.appendChild(card);
  });
}

function restockPlant(plantId, quantity) {
  const plant = PLANTS_DB.find(p => p.id === plantId);
  if (plant) {
    plant.stock += quantity;
    
    const savedStocks = JSON.parse(localStorage.getItem("viveroweb_stocks")) || {};
    savedStocks[plantId] = plant.stock;
    localStorage.setItem("viveroweb_stocks", JSON.stringify(savedStocks));
    
    const activeStockFilter = document.querySelector("#db-content-stock .filter-btn.active");
    const currentCategory = activeStockFilter ? activeStockFilter.getAttribute("data-category") : "all";
    renderStockList(currentCategory);
  }
}
