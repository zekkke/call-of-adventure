from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from google import generativeai as genai

app = Flask(__name__, template_folder="templates")
CORS(app)

genai.configure(api_key="AIzaSyC_cUcOvJLCUvqyzidr732vLk2MkMt8seM")
model = genai.GenerativeModel("gemini-2.0-flash")

@app.route('/')
def start():
    return render_template("start.html")

@app.route('/game')
def game():
    return render_template("game.html")

@app.route('/gpt', methods=['POST'])
def gpt_response():
    data = request.get_json()
    action = data.get("action")
    result = data.get("dice_result")
    difficulty = data.get("difficulty")

    prompt = (
        f"Гравець вирішив: {action}\n"
        f"Кидок d20: {result}, складність: {difficulty}.\n"
        f"{'Дія вдалася' if result >= difficulty else 'Дія провалилася'}.\n"
        "Опиши наслідок цієї дії у стилі фентезі, епічно, з деталями:"
    )

    response = model.generate_content(prompt)
    reply = response.text.strip()
    return jsonify({"reply": reply})

if __name__ == "__main__":
    app.run(debug=True)
