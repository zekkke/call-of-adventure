from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import google.generativeai as genai
import logging
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
import re

# Налаштування логування
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("server.log"),
        logging.StreamHandler()
    ]
)

# Завантаження змінних середовища
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    logging.error("API-ключ GEMINI_API_KEY не знайдено в змінних середовища")
    raise ValueError("API-ключ GEMINI_API_KEY не знайдено в змінних середовища")
genai.configure(api_key=api_key)

# Ініціалізація Flask
app = Flask(__name__, template_folder="templates") 
CORS(app) 

# Налаштування обмеження запитів
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)
limiter.init_app(app)

# Налаштування кешу
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

# Головна сторінка
@app.route('/')
def start():
    """Рендерить сторінку вибору персонажа."""
    try:
        return render_template("start.html")
    except Exception as e:
        logging.error(f"Помилка при рендерингу start.html: {str(e)}")
        return jsonify({"error": "Не вдалося завантажити сторінку вибору персонажа"}), 500
    
# Сторінка гри
@app.route('/game')
def game():
    """Рендерить сторінку гри."""
    try:
        return render_template("game.html")
    except Exception as e:
        logging.error(f"Помилка при рендерингу game.html: {str(e)}")
        return jsonify({"error": "Не вдалося завантажити сторінку гри"}), 500
    
# Генерація вступної пригоди
@app.route('/start_prompt', methods=['POST'])
@limiter.limit("10 per minute")
@cache.memoize(timeout=3600)
def start_prompt():
    """
    Генерує вступну пригоду для обраного персонажа.
    
    Args:
        JSON body з полем "character" (str): Ім’я персонажа.
    
    Returns:
        JSON: {
            "intro": "Вступний текст пригоди",
            "goal": "Ціль пригоди"
        }
        Або {"error": "Опис помилки"} у разі помилки.
    """
    logging.info("Отримано запит на /start_prompt")
    data = request.get_json()
    if not data:
        logging.error("Некоректний JSON у запиті до /start_prompt")
        return jsonify({"error": "Некоректний JSON у запиті"}), 400
    character = data.get("character", "герой")
    logging.info(f"Генерація вступу для персонажа: {character}")

    prompt = f'''
Ти — {character} у фентезійному світі. 
Вигадай пригоду з унікальною ціллю: щось здобути, врятувати, перемогти або дослідити: тільки якщо здобути - то щось фізичне, наприклад якийсь камінь, кристал чи зброю,
якщо врятувати - то когось, наприклад принцесу чи друга,
якщо перемогти, то якогось монстра, якщо дослідити - то якусь місцевість, наприклад печеру чи ліс.
вигадай мені напарника, який допоможе мені в цій пригоді, наприклад: ельф, гном, дракон, маг, воїн, принцеса чи інший персонаж.
Починай історію з будинку чи логова.
Запам'ятай основну ціль пригоди.
Не описуй ще розвиток подій — лише атмосферний вступ у фентезійному стилі. Уникай повторень. Кожного разу — інша пригода.
Після вступу додай ціль пригоди у форматі [GOAL:назва_цілі], наприклад, [GOAL:знайти камінь життя].
'''

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        logging.info(f"Успішно згенеровано вступ для {character}")

        # Витягуємо ціль із відповіді
        goal_match = re.search(r"\[GOAL:([^\]]*)\]", response_text)
        if goal_match:
            goal = goal_match.group(1).strip()
            # Видаляємо тег [GOAL] із вступу
            intro = re.sub(r"\s*\[GOAL:[^\]]*\]\s*", "", response_text).strip()
        else:
            # Якщо ціль не знайдена, встановлюємо значення за замовчуванням
            goal = "невідома ціль"
            intro = response_text
        return jsonify({"intro": intro, "goal": goal})
    except Exception as e:
        logging.error(f"Помилка генерації вступу для {character}: {str(e)}")
        return jsonify({"error": f"Помилка генерації контенту: {str(e)}"}), 500
    
# Генерація відповіді на дію гравця
@app.route('/gpt', methods=['POST'])
@limiter.limit("10 per minute")
def gpt_response():
    """
    Генерує відповідь на дію гравця у фентезійному світі.
    
    Args:
        JSON body з полями:
            - action (str): Дія гравця.
            - dice_result (float): Результат кидка кубика.
            - difficulty (float): Складність дії.
            - character (str): Ім’я персонажа.
            - intro (str): Вступна мета пригоди.
            - history (list): Історія попередніх дій.
            - weapon (str): Зброя персонажа.
            - inventory (list): Інвентар персонажа.
    
    Returns:
        JSON: {
            "reply": "Опис наслідків дії",
            "isGoalAchieved": bool,
            "finalDescription": "Фінальний опис пригоди (якщо мета досягнута)",
            "newItems": ["Список нових предметів"]
        }
        Або {"error": "Опис помилки"} у разі помилки.
    """
    logging.info("Отримано запит на /gpt")
    data = request.get_json()
    if not data:
        logging.error("Некоректний JSON у запиті до /gpt")
        return jsonify({"error": "Некоректний JSON у запиті"}), 400
    
    # Отримуємо дані з запиту
    action = data.get("action")
    result = data.get("dice_result")
    difficulty = data.get("difficulty")
    character = data.get("character", "герой")
    intro = data.get("intro", "")  # Початкова мета пригоди
    history = data.get("history", [])  # Історія дій
    weapon = data.get("weapon", "Немає зброї") # Зброя
    inventory = data.get("inventory", []) # Інвентар

    # Валідація вхідних даних
    if not action or result is None or difficulty is None:
        logging.error("Відсутні обов’язкові параметри: action, dice_result або difficulty")
        return jsonify({"error": "Відсутні обов’язкові параметри: action, dice_result або difficulty"}), 400

    try:
        result = float(result)
        difficulty = float(difficulty)
    except (ValueError, TypeError):
        logging.error("dice_result і difficulty мають бути числами")
        return jsonify({"error": "dice_result і difficulty мають бути числами"}), 400

    if len(action) > 500:
        logging.error("Дія занадто довга (максимум 500 символів)")
        return jsonify({"error": "Дія занадто довга (максимум 500 символів)"}), 400

    if len(str(history)) > 1000000:
        logging.error("Історія занадто велика (максимум 1000000 символів)")
        return jsonify({"error": "Історія занадто велика (максимум 1000000 символів)"}), 400

    # Перетворюємо всі елементи inventory на рядки
    inventory = [str(item) for item in inventory if item is not None]

    # Формуємо короткий контекст із історії (останні 3 дії, щоб не перевантажувати промпт)
    history_context = "\n".join([f"{entry['action']}\n{entry['reply']}" for entry in history[-5:]]) if history else "Попередніх дій немає."
    if len(history_context) > 1000:
        history_context = history_context[-1000:]

    prompt = f"""
Ти — {character} у фентезійному світі. Твоя основна мета пригоди: {intro}.
Твоя зброя: {weapon}.
Твій інвентар: {", ".join(inventory) if inventory else "Інвентар порожній"}.
Ось що відбувалося раніше (останні дії та їх наслідки):
{history_context}

Гравець намагається: "{action}".
Кидок d20 з бонусом: {result} (складність: {difficulty}). 
{"Дія вдалася." if result >= difficulty else "Дія провалилася."}

 Опиши наслідок цієї дії коротко (до 3-4 речень), у фентезійному стилі. Враховуй зброю та інвентар героя, якщо вони можуть допомогти в дії. По можливості додавай труднощів, пасток чи персонажів, які будуть затрудняти досягнення головної мети. 
 Не описуй нову ціль — лише реакцію на дію. 
 Залишайся в рамках основної мети пригоди, описуючи лише реакцію на дію, без введення нових цілей.

 Якщо дія передбачає знаходження нового предмета (наприклад: "взяти меч", "знайти еліксир", "підняти щось", "вкрасти якусь річ"), додай тег [NEW_ITEM:назва_предмета] (наприклад, [NEW_ITEM:Меч], [NEW_ITEM:Еліксир здоров’я]).

 Визнач, чи досягнута основна мета пригоди після цієї дії. 
Якщо мета досягнута (наприклад, гравець виконав ключову дію, пов’язану з ціллю), напиши: "[META_ACHIEVED]".
Якщо мета ще не досягнута, нічого не додавай.

 Якщо мета досягнута, додай фінальний опис пригоди (3-4 речення), який підводить підсумок, вихваляє і нагороджує героя, завершує історію, у фентезійному стилі.
"""

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt)
        response_text = response.text.strip()
    except Exception as e:
        logging.error(f"Помилка генерації відповіді для дії '{action}': {str(e)}")
        return jsonify({"error": f"Помилка генерації контенту: {str(e)}"}), 500

    # Перевіряємо, чи досягнута мета
    is_goal_achieved = "[META_ACHIEVED]" in response_text
    reply = response_text
    final_description = ""
    new_items = []

    # Якщо мета досягнута, видаляємо тег [META_ACHIEVED] з відповіді
    if is_goal_achieved:
        reply = response_text.replace("[META_ACHIEVED]", "").strip()
        if "[FINAL_DESCRIPTION]" in reply:
            reply, final_description = reply.split("[FINAL_DESCRIPTION]")
            reply = reply.strip()
            final_description = final_description.strip()
        else:
            final_description = reply
        logging.info(f"Після видалення [META_ACHIEVED] і [FINAL_DESCRIPTION]: reply={reply}, final_description={final_description}")

    # Потім обробляємо [NEW_ITEM]
    new_item_matches = re.findall(r"\[NEW_ITEM:([^\]]*)\]", reply)
    if new_item_matches:
        new_items = [item.strip() for item in new_item_matches if item.strip() and len(item.strip()) > 1]
        logging.info(f"Знайдено нові предмети: {new_items}")
        # Видаляємо теги [NEW_ITEM:назва_предмета], враховуючи можливі пробіли та переноси рядків
        reply = re.sub(r"\s*\[NEW_ITEM:[^\]]*\]\s*", " ", reply, flags=re.MULTILINE).strip()
        # Замінюємо можливі подвійні пробіли
        reply = re.sub(r"\s+", " ", reply).strip()
        logging.info(f"Після видалення [NEW_ITEM]: reply={reply}")
        
    # Перевіряємо, чи залишилися теги [NEW_ITEM] у final_description
    if final_description and "[NEW_ITEM:" in final_description:
        new_item_matches_final = re.findall(r"\[NEW_ITEM:([^\]]*)\]", final_description)
        if new_item_matches_final:
            new_items.extend([item.strip() for item in new_item_matches_final if item.strip() and len(item.strip()) > 1])
            final_description = re.sub(r"\s*\[NEW_ITEM:[^\]]*\]\s*", " ", final_description, flags=re.MULTILINE).strip()
            final_description = re.sub(r"\s+", " ", final_description).strip()
            logging.info(f"Після видалення [NEW_ITEM] із final_description: final_description={final_description}")
            
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
