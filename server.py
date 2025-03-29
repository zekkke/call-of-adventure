from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import google.generativeai as genai
import re

# Завантаження змінних середовища
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

# Ініціалізація Flask
app = Flask(__name__, template_folder="templates") 
CORS(app) 

# Головна сторінка
@app.route('/')
def start():
    return render_template("start.html")

# Сторінка гри
@app.route('/game')
def game():
    return render_template("game.html")

# Генерація вступної пригоди
@app.route('/start_prompt', methods=['POST'])
def start_prompt():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Некоректний JSON у запиті"}), 400
    character = data.get("character", "герой")

    prompt = f'''
Ти — {character} у фентезійному світі. Вигадай одну пригоду з унікальною ціллю: щось здобути, врятувати, перемогти або дослідити. Запам'ятай основну ціль пригоди.
Не описуй ще розвиток подій — лише атмосферний вступ у фентезійному стилі. Уникай повторень. Кожного разу — інша пригода.
'''

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    return jsonify({"intro": response.text.strip()})

# Генерація відповіді на дію гравця
@app.route('/gpt', methods=['POST'])
def gpt_response():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Некоректний JSON у запиті"}), 400
    action = data.get("action")
    result = data.get("dice_result")
    difficulty = data.get("difficulty")
    character = data.get("character", "герой")
    intro = data.get("intro", "")  # Початкова мета пригоди
    history = data.get("history", [])  # Історія дій
    weapon = data.get("weapon", "Немає зброї") # Зброя
    inventory = data.get("inventory", []) # Інвентар

    # Перетворюємо всі елементи inventory на рядки
    inventory = [str(item) for item in inventory if item is not None]

    # Формуємо короткий контекст із історії (останні 3 дії, щоб не перевантажувати промпт)
    history_context = "\n".join([f"{entry['action']}\n{entry['reply']}" for entry in history[-5:]]) if history else "Попередніх дій немає."

    prompt = f"""
Ти — {character} у фентезійному світі. Твоя основна мета пригоди: {intro}.
Твоя зброя: {weapon}.
Твій інвентар: {", ".join(inventory) if inventory else "Інвентар порожній"}.
Ось що відбувалося раніше (останні дії та їх наслідки):
{history_context}

Гравець намагається: "{action}".
Кидок d20 з бонусом: {result} (складність: {difficulty}). 
{"Дія вдалася." if result >= difficulty else "Дія провалилася."}

 Опиши наслідок цієї дії коротко (до 3-4 речень), у фентезійному стилі. Враховуй зброю та інвентар героя, якщо вони можуть допомогти в дії. Не описуй нову ціль — лише реакцію на дію. Залишайся в рамках основної мети пригоди, описуючи лише реакцію на дію, без введення нових цілей.

 Якщо дія передбачає знаходження нового предмета (наприклад: "взяти меч", "знайти еліксир", "підняти щось", "вкрасти якусь річ"), додай тег [NEW_ITEM:назва_предмета] (наприклад, [NEW_ITEM:Меч], [NEW_ITEM:Еліксир здоров’я]).

 Визнач, чи досягнута основна мета пригоди після цієї дії. 
Якщо мета досягнута (наприклад, гравець виконав ключову дію, пов’язану з ціллю), напиши: "[META_ACHIEVED]".
Якщо мета ще не досягнута, нічого не додавай.

 Якщо мета досягнута, додай фінальний опис пригоди (3-4 речення), який підводить підсумок, вихваляє і нагороджує героя, завершує історію, у фентезійному стилі.
"""

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    response_text = response.text.strip()

    # Перевіряємо, чи досягнута мета
    is_goal_achieved = "[META_ACHIEVED]" in response_text
    reply = response_text
    final_description = ""
    new_items = []

    if is_goal_achieved:
        reply = response_text.replace("[META_ACHIEVED]", "").strip()
        if "[FINAL_DESCRIPTION]" in reply:
            reply, final_description = reply.split("[FINAL_DESCRIPTION]")
            reply = reply.strip()
            final_description = final_description.strip()
        else:
            final_description = reply

    # Потім обробляємо [NEW_ITEM]
    new_item_matches = re.findall(r"\[NEW_ITEM:([^\]]*)\]", reply)
    if new_item_matches:
        new_items = [item.strip() for item in new_item_matches if item.strip() and len(item.strip()) > 1]
        # Видаляємо теги [NEW_ITEM:назва_предмета], враховуючи можливі пробіли та переноси рядків
        reply = re.sub(r"\s*\[NEW_ITEM:[^\]]*\]\s*", " ", reply, flags=re.MULTILINE).strip()
        # Замінюємо можливі подвійні пробіли
        reply = re.sub(r"\s+", " ", reply).strip()
        
    # Перевіряємо, чи залишилися теги [NEW_ITEM] у final_description
    if final_description and "[NEW_ITEM:" in final_description:
        new_item_matches_final = re.findall(r"\[NEW_ITEM:([^\]]*)\]", final_description)
        if new_item_matches_final:
            new_items.extend([item.strip() for item in new_item_matches_final if item.strip() and len(item.strip()) > 1])
            final_description = re.sub(r"\s*\[NEW_ITEM:[^\]]*\]\s*", " ", final_description, flags=re.MULTILINE).strip()
            final_description = re.sub(r"\s+", " ", final_description).strip()
            
    # Додаємо повідомлення про нові предмети в reply
    if new_items:
        reply += f"\n(Додано до інвентарю: {', '.join(new_items)})"

    return jsonify({
        "reply": reply,
        "isGoalAchieved": is_goal_achieved,
        "finalDescription": final_description,
        "newItems": new_items
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
