import { BOT_KNOWLEDGE } from './database.js';

let chatMessagesContainer, chatUserInput, chatSendBtn, chatTypingIndicator, chatTopicsList;

export function initChatbot() {
  chatMessagesContainer = document.getElementById("chat-messages-container");
  chatUserInput = document.getElementById("chat-user-input");
  chatSendBtn = document.getElementById("chat-send-btn");
  chatTypingIndicator = document.getElementById("chat-typing-indicator");
  chatTopicsList = document.getElementById("chat-topics-list");

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", sendUserMessage);
  }
  if (chatUserInput) {
    chatUserInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendUserMessage();
    });
  }

  if (chatTopicsList) {
    const topics = chatTopicsList.querySelectorAll("li");
    topics.forEach(li => {
      li.addEventListener("click", () => {
        const question = li.getAttribute("data-question");
        chatUserInput.value = question;
        sendUserMessage();
      });
    });
  }
}

function sendUserMessage() {
  const query = chatUserInput.value.trim();
  if (query === "") return;

  appendMessage(query, "user");
  chatUserInput.value = "";

  chatTypingIndicator.style.display = "flex";
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  setTimeout(() => {
    chatTypingIndicator.style.display = "none";
    
    const botReply = getBotResponse(query);
    appendMessage(botReply, "bot");
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }, 1000);
}

function appendMessage(text, sender) {
  const msgEl = document.createElement("div");
  msgEl.className = `message ${sender}`;
  msgEl.textContent = text;
  chatMessagesContainer.appendChild(msgEl);
}

function getBotResponse(query) {
  const q = query.toLowerCase();
  
  if (q.includes("riego") || q.includes("regar") || q.includes("agua")) {
    return BOT_KNOWLEDGE.riego;
  }
  if (q.includes("monstera") || q.includes("costilla de adán")) {
    return BOT_KNOWLEDGE.monstera;
  }
  if (q.includes("amarilla") || q.includes("amarillas")) {
    return BOT_KNOWLEDGE.amarilla;
  }
  if (q.includes("marrón") || q.includes("marron") || q.includes("seca") || q.includes("secas")) {
    return BOT_KNOWLEDGE.marron;
  }
  if (q.includes("luz") || q.includes("sol") || q.includes("iluminación")) {
    return BOT_KNOWLEDGE.luz;
  }
  if (q.includes("sombra") || q.includes("poca luz") || q.includes("oscuridad")) {
    return BOT_KNOWLEDGE.sombra;
  }
  if (q.includes("abono") || q.includes("fertilizar") || q.includes("tierra")) {
    return BOT_KNOWLEDGE.abono;
  }
  if (q.includes("mascota") || q.includes("perro") || q.includes("gato") || q.includes("tóxica") || q.includes("toxica")) {
    return BOT_KNOWLEDGE.mascota;
  }

  return "🌿 Qué interesante pregunta. Como recomendación general, asegúrate de colocar tus plantas en un sitio luminoso y bien ventilado, y riega solo cuando el sustrato esté seco al tacto. ¿Hay algún tipo de planta específica de la que te gustaría saber más?";
}
