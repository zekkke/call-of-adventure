const character = localStorage.getItem("character");
document.getElementById("hero").innerText = "Обраний персонаж: " + character;
document.getElementById("intro").innerText = localStorage.getItem("intro");

function estimateDifficulty(action) {
  const simple = ["запалити", "узяти", "відкрити", "оглянути", "підібрати", "підняти"];
  const medium = ["перестрибнути", "перелізти", "вкрасти", "сховатися", "взламати", "влучити"];
  const hard = ["переконати", "знищити", "обдурити", "перемогти", "виконати трюк", "побороти"];

  const text = action.toLowerCase();

  if (hard.some(word => text.includes(word))) return 18;
  if (medium.some(word => text.includes(word))) return 12;
  if (simple.some(word => text.includes(word))) return 6;
  return 10; // стандарт
}

async function sendAction() {
  const actionInput = document.getElementById("action");
  const action = actionInput.value.trim();
  if (!action) return;

  const dice = Math.floor(Math.random() * 20) + 1;
  const difficulty = estimateDifficulty(action);

  log(`\n> Ти пробуєш: ${action}\nКидок d20: ${dice} (складність: ${difficulty})`);

  try {
    const response = await fetch("/gpt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, dice_result: dice, difficulty, character })
    });

    const data = await response.json();
    log(data.reply);
    actionInput.value = "";
  } catch (error) {
    log("Помилка при зв'язку з сервером.");
    console.error(error);
  }
}

function log(text) {
  const logDiv = document.getElementById("log");
  logDiv.innerText += text + "\n";
  logDiv.scrollTop = logDiv.scrollHeight;
}
