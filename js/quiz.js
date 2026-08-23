import { PLANTS_DB } from './database.js';
import { addToCart } from './cart.js';

let currentQuizStep = 1;
let quizAnswers = {
  light: null,
  water: null,
  pets: null
};

let quizSteps, quizOptions, quizPrevBtn, quizNextBtn, quizProgressBar, quizCard;

export function initQuiz() {
  quizSteps = document.querySelectorAll(".quiz-step");
  quizOptions = document.querySelectorAll(".quiz-option");
  quizPrevBtn = document.getElementById("quiz-prev-btn");
  quizNextBtn = document.getElementById("quiz-next-btn");
  quizProgressBar = document.getElementById("quiz-progress-bar");
  quizCard = document.querySelector(".quiz-card");

  bindQuizEvents();
}

function bindQuizEvents() {
  if (!quizCard) return;

  quizCard.addEventListener("click", (e) => {
    const option = e.target.closest(".quiz-option");
    if (option) {
      const type = option.getAttribute("data-option");
      const val = option.getAttribute("data-value");
      
      const brothers = option.parentNode.querySelectorAll(".quiz-option");
      brothers.forEach(b => b.classList.remove("selected"));
      option.classList.add("selected");
      
      quizAnswers[type] = val;
      checkNextButtonState();
    }

    if (e.target.id === "quiz-next-btn") {
      if (currentQuizStep < 3) {
        currentQuizStep++;
        showStep(currentQuizStep);
      } else {
        showQuizResults();
      }
    }

    if (e.target.id === "quiz-prev-btn") {
      if (currentQuizStep > 1) {
        currentQuizStep--;
        showStep(currentQuizStep);
      }
    }

    if (e.target.id === "quiz-reset-btn") {
      resetQuiz();
    }

    if (e.target.id === "quiz-add-cart-btn") {
      const plantId = parseInt(e.target.getAttribute("data-id"));
      addToCart(plantId);
    }
  });
}

function showStep(step) {
  const steps = quizCard.querySelectorAll(".quiz-step");
  steps.forEach(s => s.classList.remove("active"));
  
  const activeStep = quizCard.querySelector(`.quiz-step[data-step="${step}"]`);
  if (activeStep) activeStep.classList.add("active");
  
  const prevBtn = quizCard.querySelector("#quiz-prev-btn");
  const nextBtn = quizCard.querySelector("#quiz-next-btn");
  const progBar = quizCard.querySelector("#quiz-progress-bar");

  if (prevBtn) prevBtn.disabled = step === 1;
  if (nextBtn) nextBtn.textContent = step === 3 ? "Ver Recomendaciones" : "Siguiente";
  
  if (progBar) {
    const progressPercent = ((step - 1) / 3) * 100;
    progBar.style.width = `${progressPercent}%`;
  }

  checkNextButtonState();
}

function checkNextButtonState() {
  const nextBtn = quizCard.querySelector("#quiz-next-btn");
  if (!nextBtn) return;

  let type = "";
  if (currentQuizStep === 1) type = "light";
  else if (currentQuizStep === 2) type = "water";
  else if (currentQuizStep === 3) type = "pets";

  nextBtn.disabled = quizAnswers[type] === null;
}

function showQuizResults() {
  const progBar = quizCard.querySelector("#quiz-progress-bar");
  if (progBar) progBar.style.width = "100%";
  
  let matches = PLANTS_DB.filter(plant => {
    const lightMatch = plant.light === quizAnswers.light;
    const waterMatch = plant.water === quizAnswers.water;
    const petMatch = (quizAnswers.pets === "no" || plant.pets === "si");
    return lightMatch && waterMatch && petMatch;
  });

  if (matches.length === 0) {
    matches = PLANTS_DB.filter(plant => {
      return plant.light === quizAnswers.light && (quizAnswers.pets === "no" || plant.pets === "si");
    });
  }

  if (matches.length === 0) {
    matches = PLANTS_DB.filter(plant => plant.light === quizAnswers.light).slice(0, 2);
  }

  const matchPlant = matches[0] || PLANTS_DB[0];
  
  quizCard.innerHTML = `
    <div class="quiz-result-container">
      <h3 style="font-size: 1.8rem; margin-bottom: 0.5rem; color: var(--primary-color);">¡Tu Planta Ideal es la:</h3>
      <h2 style="font-size: 2.5rem; margin-bottom: 1.5rem; color: var(--accent-color);">${matchPlant.name}!</h2>
      
      <div class="result-card-wrapper">
        <div class="plant-card" style="margin: 0 auto; text-align: left;">
          <div class="plant-image-container">
            <img src="${matchPlant.image}" alt="${matchPlant.name}">
            <span class="plant-tag">${matchPlant.category.charAt(0).toUpperCase() + matchPlant.category.slice(1)}</span>
          </div>
          <div class="plant-info">
            <h3 class="plant-title">${matchPlant.name}</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">${matchPlant.desc}</p>
            <div class="plant-meta" style="margin-bottom: 1rem;">
              <span><strong>Luz:</strong> ${matchPlant.lightDesc}</span>
              <span><strong>Riego:</strong> ${matchPlant.waterDesc}</span>
              <span><strong>Mascotas:</strong> ${matchPlant.petDesc}</span>
            </div>
            <div class="plant-purchase">
              <span class="plant-price">$${matchPlant.price.toFixed(2)}</span>
              <button class="add-to-cart-btn" id="quiz-add-cart-btn" data-id="${matchPlant.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                Agregar al Carrito
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <button class="quiz-btn quiz-btn-secondary" id="quiz-reset-btn" style="margin-top: 1.5rem;">Volver a realizar el test</button>
    </div>
  `;
}

export function resetQuiz() {
  currentQuizStep = 1;
  quizAnswers = { light: null, water: null, pets: null };
  
  quizCard.innerHTML = `
    <div class="progress-bar-container">
      <div class="progress-bar" id="quiz-progress-bar" style="width: 0%;"></div>
    </div>
    
    <div class="quiz-step active" data-step="1">
      <div class="quiz-question">¿Cuál es el nivel de luz en el espacio donde colocarás la planta?</div>
      <div class="quiz-options">
        <div class="quiz-option" data-value="alta" data-option="light">
          <svg viewBox="0 0 24 24"><path d="M12,18A6,6 0 1,1 18,12A6,6 0 0,1 12,18M12,8A4,4 0 1,0 16,12A4,4 0 0,0 12,8M12,2V4M12,20V22M3.5,12H5.5M18.5,12H20.5M5.64,5.64L7.05,7.05M16.95,16.95L18.36,18.36M18.36,5.64L16.95,7.05M7.05,16.95L5.64,18.36" /></svg>
          <div class="quiz-option-text">Luz Directa / Alta</div>
        </div>
        <div class="quiz-option" data-value="media" data-option="light">
          <svg viewBox="0 0 24 24"><path d="M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M12 4A8 8 0 0 1 20 12A8 8 0 0 1 12 20V4Z" /></svg>
          <div class="quiz-option-text">Luz Indirecta / Media</div>
        </div>
        <div class="quiz-option" data-value="baja" data-option="light">
          <svg viewBox="0 0 24 24"><path d="M12.3 2A10 10 0 0 0 21.8 14.3A9 9 0 1 1 12.3 2Z"/></svg>
          <div class="quiz-option-text">Poca Luz / Sombra</div>
        </div>
      </div>
    </div>
    
    <div class="quiz-step" data-step="2">
      <div class="quiz-question">¿Con qué frecuencia planeas o puedes regar la planta?</div>
      <div class="quiz-options">
        <div class="quiz-option" data-value="alta" data-option="water">
          <svg viewBox="0 0 24 24"><path d="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20M12,5.5C11.58,6.23 7.8,12.21 7.8,14A4.2,4.2 0 0,0 12,18.2A4.2,4.2 0 0,0 16.2,14C16.2,12.21 12.42,6.23 12,5.5Z" /></svg>
          <div class="quiz-option-text">Frecuente (Tierra húmeda)</div>
        </div>
        <div class="quiz-option" data-value="baja" data-option="water">
          <svg viewBox="0 0 24 24"><path d="M12,2A2,2 0 0,0 10,4V5C7.79,5 6,6.79 6,9V11H4A2,2 0 0,0 2,13V15A2,2 0 0,0 4,17H6V19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V15H20A2,2 0 0,0 22,13V10A2,2 0 0,0 20,8H18V4A2,2 0 0,0 16,2H12M12,4H16V8H14V11H12V4M8,7H10V12H8V7M18,10H20V13H18V10M8,19V14H16V19H8Z" /></svg>
          <div class="quiz-option-text">Moderado / Bajo (Dejar secar)</div>
        </div>
      </div>
    </div>
    
    <div class="quiz-step" data-step="3">
      <div class="quiz-question">¿Tienes mascotas en casa? (Perros o gatos)</div>
      <div class="quiz-options">
        <div class="quiz-option" data-value="si" data-option="pets">
          <svg viewBox="0 0 24 24"><path d="M12,14A3,3 0 0,1 15,17A3,3 0 0,1 12,20A3,3 0 0,1 9,17A3,3 0 0,1 12,14M7,11A2,2 0 0,1 9,13A2,2 0 0,1 7,15A2,2 0 0,1 5,13A2,2 0 0,1 7,11M17,11A2,2 0 0,1 19,13A2,2 0 0,1 17,15A2,2 0 0,1 15,13A2,2 0 0,1 17,11M12,8A2.5,2.5 0 0,1 14.5,10.5A2.5,2.5 0 0,1 12,13A2.5,2.5 0 0,1 9.5,10.5A2.5,2.5 0 0,1 12,8Z" /></svg>
          <div class="quiz-option-text">Sí, necesito plantas seguras (Pet-Friendly)</div>
        </div>
        <div class="quiz-option" data-value="no" data-option="pets">
          <svg viewBox="0 0 24 24"><path d="M12,2C11.38,2 10.74,2.35 10.15,3C7.94,5.4 6.78,8.28 6.78,11.23C6.78,14.67 8.5,17.43 11,18.81V22H13V18.81C15.5,17.43 17.22,14.67 17.22,11.23C17.22,8.28 16.06,5.4 13.85,3C13.26,2.35 12.62,2 12,2Z" /></svg>
          <div class="quiz-option-text">No tengo mascotas / No me preocupa</div>
        </div>
      </div>
    </div>
    
    <div class="quiz-nav">
      <button class="quiz-btn quiz-btn-secondary" id="quiz-prev-btn" disabled>Atrás</button>
      <button class="quiz-btn quiz-btn-primary" id="quiz-next-btn" disabled>Siguiente</button>
    </div>
  `;
}
