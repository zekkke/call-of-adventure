from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import google.generativeai as genai

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
    character = data.get("character", "герой")

    prompt = f'''
Ти — {character} у фентезійному світі. Вигадай пригоду з унікальною ціллю: щось здобути, врятувати, перемогти або дослідити.
Не описуй ще розвиток подій — лише атмосферний вступ у фентезійному стилі. Уникай повторень. Кожного разу — інша пригода.
'''

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    return jsonify({"intro": response.text.strip()})

# Генерація відповіді на дію гравця
@app.route('/gpt', methods=['POST'])
def gpt_response():
    data = request.get_json()
    action = data.get("action")
    result = data.get("dice_result")
    difficulty = data.get("difficulty")
    character = data.get("character", "герой")

    prompt = f"""
Ти — {character} у фентезійному світі. Гравець намагається: "{action}".
Кидок d20: {result} (складність: {difficulty}). 
{"Дія вдалася." if result >= difficulty else "Дія провалилася."}

Опиши наслідок цієї дії коротко (до 5-6 речень), у фентезійному стилі. Не описуй нову ціль — лише реакцію на дію.
"""

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    return jsonify({ "reply": response.text.strip() })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)

