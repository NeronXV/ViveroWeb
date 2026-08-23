import { PLANTS_DB } from './database.js';
import { initCart, addToCart } from './cart.js';
import { initQuiz } from './quiz.js';
import { initChatbot } from './chatbot.js';
import { initDashboard } from './dashboard.js';

let catalogGrid, searchInput, searchBtn, filterBtns, themeToggleBtn, themeIconDark, themeIconLight;

document.addEventListener("DOMContentLoaded", () => {
  catalogGrid = document.getElementById("catalog-grid-container");
  searchInput = document.getElementById("catalog-search");
  searchBtn = document.getElementById("search-btn");
  filterBtns = document.querySelectorAll(".filter-btn");
  themeToggleBtn = document.getElementById("theme-toggle-btn");
  themeIconDark = document.getElementById("theme-icon-dark");
  themeIconLight = document.getElementById("theme-icon-light");

  // Load custom list and promotions
  const customPlants = JSON.parse(localStorage.getItem("viveroweb_custom_plants")) || [];
  customPlants.forEach(p => {
    if (!PLANTS_DB.some(x => x.id === p.id)) {
      PLANTS_DB.push(p);
    }
  });

  const promos = JSON.parse(localStorage.getItem("viveroweb_promotions")) || {};
  const savedStocks = JSON.parse(localStorage.getItem("viveroweb_stocks")) || {};
  PLANTS_DB.forEach(p => {
    p.discount = promos[p.id] || 0;
    if (savedStocks[p.id] !== undefined) {
      p.stock = savedStocks[p.id];
    }
  });

  // Load editorial layout
  const editorial = JSON.parse(localStorage.getItem("viveroweb_editorial"));
  if (editorial) {
    const titleEl = document.querySelector(".hero h1");
    const descEl = document.querySelector(".hero p");
    const badgeEl = document.querySelector(".hero-badge");
    
    if (titleEl) titleEl.textContent = editorial.title;
    if (descEl) descEl.textContent = editorial.desc;
    if (badgeEl) {
      badgeEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
        </svg>
        ${editorial.announcement}
      `;
    }
  }

  // Initial catalog draw
  renderCatalog(PLANTS_DB);
  
  // Modules init
  initCart();
  initTheme();
  initQuiz();
  initChatbot();
  initDashboard();

  // Search bindings
  if (filterBtns) {
    filterBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        filterBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const category = btn.getAttribute("data-category");
        applyFilters(category, searchInput ? searchInput.value : "");
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const activeBtn = document.querySelector(".filter-btn.active");
      const category = activeBtn ? activeBtn.getAttribute("data-category") : "all";
      applyFilters(category, searchInput.value);
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const activeBtn = document.querySelector(".filter-btn.active");
      const category = activeBtn ? activeBtn.getAttribute("data-category") : "all";
      applyFilters(category, searchInput ? searchInput.value : "");
    });
  }

  document.addEventListener("catalog-updated", () => {
    const activeBtn = document.querySelector(".filter-btn.active");
    const category = activeBtn ? activeBtn.getAttribute("data-category") : "all";
    applyFilters(category, searchInput ? searchInput.value : "");
  });
});

function initTheme() {
  const savedTheme = localStorage.getItem("viveroweb_theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeIconDark) themeIconDark.style.display = "none";
    if (themeIconLight) themeIconLight.style.display = "block";
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark-theme");
      localStorage.setItem("viveroweb_theme", isDark ? "dark" : "light");
      
      if (isDark) {
        themeIconDark.style.display = "none";
        themeIconLight.style.display = "block";
      } else {
        themeIconDark.style.display = "block";
        themeIconLight.style.display = "none";
      }
    });
  }
}

export function renderCatalog(plants) {
  if (!catalogGrid) return;
  catalogGrid.innerHTML = "";
  if (plants.length === 0) {
    catalogGrid.innerHTML = `<div class="cart-empty-msg" style="grid-column: 1/-1;">No se encontraron plantas que coincidan con la búsqueda.</div>`;
    return;
  }

  plants.forEach(plant => {
    const hasPromo = plant.discount > 0;
    const finalPrice = hasPromo ? plant.price * (1 - plant.discount / 100) : plant.price;
    const card = document.createElement("article");
    card.className = "plant-card";
    card.innerHTML = `
      <div class="plant-image-container">
        <img src="${plant.image}" alt="${plant.name}" loading="lazy">
        <span class="plant-tag">${capitalize(plant.category)}</span>
      </div>
      <div class="plant-info">
        <h3 class="plant-title">${plant.name}</h3>
        <div class="plant-meta">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,18A6,6 0 1,1 18,12A6,6 0 0,1 12,18M12,8A4,4 0 1,0 16,12A4,4 0 0,0 12,8M12,2V4M12,20V22M3.5,12H5.5M18.5,12H20.5M5.64,5.64L7.05,7.05M16.95,16.95L18.36,18.36M18.36,5.64L16.95,7.05M7.05,16.95L5.64,18.36" />
            </svg>
            ${plant.lightDesc}
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z" />
            </svg>
            ${plant.waterDesc}
          </span>
        </div>
        <div class="plant-purchase">
          <span class="plant-price">
            ${hasPromo ? `<span class="plant-price-original">$${plant.price.toFixed(2)}</span>` : ''}
            $${finalPrice.toFixed(2)}
            ${hasPromo ? `<span class="plant-promo-tag">${plant.discount}% OFF</span>` : ''}
          </span>
          <button class="add-to-cart-btn" data-id="${plant.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            Agregar
          </button>
        </div>
      </div>
    `;
    
    card.querySelector(".add-to-cart-btn").addEventListener("click", () => {
      addToCart(plant.id);
    });

    catalogGrid.appendChild(card);
  });
}

export function applyFilters(category, query) {
  let filtered = PLANTS_DB;

  if (category !== "all") {
    filtered = filtered.filter(p => p.category === category);
  }

  if (query.trim() !== "") {
    const q = query.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q));
  }

  renderCatalog(filtered);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
