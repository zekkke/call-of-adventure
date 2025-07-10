from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import google.generativeai as genai
import logging
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
import json
import random
import uuid
import re
import bleach
from jsonschema import validate, ValidationError
from functools import lru_cache
import urllib.parse
from typing import Dict, List, Any, Optional

# Налаштування логування
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("server.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)

# Завантаження змінних середовища
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
server_port = os.getenv("SERVER_PORT", 5000)
if not api_key:
    logging.error("GEMINI_API_KEY not found")
    raise ValueError("GEMINI_API_KEY not found")
genai.configure(api_key=api_key)

# Ініціалізація моделі
MODEL = genai.GenerativeModel("gemini-2.0-flash")

# Завантаження конфігураційних файлів
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_game_data():
    with open(os.path.join(BASE_DIR, 'game_data.json'), 'r', encoding='utf-8') as f:
        return json.load(f)

try:
    with open(os.path.join(BASE_DIR, 'prompts.json'), 'r', encoding='utf-8') as f:
        PROMPTS = json.load(f)
except FileNotFoundError:
    logging.error("prompts.json not found")
    raise FileNotFoundError("prompts.json not found")

# Завантаження перекладів
def load_translations():
    translations = {}
    for lang in ['uk', 'en', 'ru']:
        path = os.path.join(BASE_DIR, 'locales', lang, 'translation.json')
        try:
            with open(path, 'r', encoding='utf-8') as f:
                translations[lang] = json.load(f)
        except FileNotFoundError:
            logging.error(f"Translation file for {lang} not found")
            raise
    return translations

TRANSLATIONS = load_translations()

# Ініціалізація Flask
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)  # У продакшені обмежте origins

# Налаштування обмеження запитів
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["500 per day", "100 per hour"],
    storage_uri="memory://"
)
limiter.init_app(app)

# Налаштування кешу
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

# Схеми валідації JSON
SCHEMAS = {
    'start_prompt': {
        "type": "object",
        "properties": {
            "heroname": {"type": "string", "maxLength": 50},
            "race": {"type": "string", "maxLength": 50},
            "characterClass": {"type": "string", "maxLength": 50}
        },
        "required": ["heroname", "race", "characterClass"]
    },
    'npc': {
        "type": "object",
        "properties": {
            "heroname": {"type": "string", "maxLength": 50},
            "npcName": {"type": "string", "maxLength": 100},
            "context": {"type": "string", "maxLength": 500},
            "race": {"type": "string", "maxLength": 50},
            "characterClass": {"type": "string", "maxLength": 50},
            "stored_npcs": {"type": "object"}
        },
        "required": ["heroname", "npcName", "context"]
    },
    'combat': {
        "type": "object",
        "properties": {
            "action": {"type": "string", "maxLength": 500},
            "npc": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "hp": {"type": "number"},
                    "ac": {"type": "number"},
                    "attackBonus": {"type": "number"},
                    "damageDice": {"type": "string"}
                },
                "required": ["name", "hp", "ac"]
            },
            "player_stats": {
                "type": "object",
                "properties": {
                    "hp": {"type": "number"},
                    "ac": {"type": "number"},
                    "strength": {"type": "number"},
                    "dexterity": {"type": "number"},
                    "constitution": {"type": "number"},
                    "intelligence": {"type": "number"},
                    "wisdom": {"type": "number"},
                    "charisma": {"type": "number"},
                    "weapon": {"type": "string"},
                    "damageDice": {"type": "string"},
                    "attackBonus": {"type": "number"}
                }
            },
            "player_hp": {"type": "number"},
            "npc_hp": {"type": "number"},
            "weapon": {"type": "string"},
            "damage_dice": {"type": "string"},
            "attack_bonus": {"type": "number"},
            "location": {"type": "string", "maxLength": 50}
        },
        "required": ["action", "npc", "player_stats", "player_hp", "npc_hp"]
    },
    'gpt': {
        "type": "object",
        "properties": {
            "action": {"type": "string", "maxLength": 500},
            "dice_result": {"type": "number"},
            "difficulty": {"type": "number"},
            "heroname": {"type": "string", "maxLength": 50},
            "race": {"type": "string", "maxLength": 50},
            "characterClass": {"type": "string", "maxLength": 50},
            "intro": {"type": "string", "maxLength": 1000},
            "goal": {"type": "string", "maxLength": 500},
            "history": {"type": "array", "maxItems": 100},
            "weapon": {"type": "string", "maxLength": 50},
            "inventory": {"type": "array", "maxItems": 50},
            "location": {"type": "string", "maxLength": 50},
            "stored_npcs": {"type": "object"},
            "NPCName": {"type": ["string", "null"], "maxLength": 100}
        },
        "required": ["action", "dice_result", "difficulty", "heroname"]
    }
}

# Утилітні функції
def get_locale() -> str:
    lang = request.args.get('language', request.headers.get('Accept-Language', 'uk')[:2])
    return lang if lang in ['uk', 'en', 'ru'] else 'uk'

def get_translation(key: str, lang: str, default: Optional[str] = None) -> str:
    keys = key.split('.')
    current = TRANSLATIONS.get(lang, {})
    for k in keys:
        current = current.get(k)
        if current is None:
            return default or key
    return current

@lru_cache(maxsize=32)
def get_game_data_key(key: str, lang: str) -> Any:
    game_data = load_game_data()
    keys = key.split('.')
    current = game_data
    for k in keys:
        current = current.get(k, {})
    return current.get(lang, current)

def validate_json(data: Dict, schema: Dict) -> bool:
    try:
        validate(instance=data, schema=schema)
        return True
    except ValidationError as e:
        logging.error(f"JSON validation error: {e}")
        return False

def roll_dice(dice: str) -> int:
    match = re.match(r'(\d*)d(\d+)', dice)
    if not match:
        return 0  # Некоректний формат — 0 урону
    count = int(match.group(1)) if match.group(1) else 1
    sides = int(match.group(2))
    return sum(random.randint(1, sides) for _ in range(count))

# Обробка інвентарю
def process_inventory_use(action: str, inventory: List, lang: str, heroname: str) -> Dict:
    game_data = load_game_data()
    use_keywords = game_data['check_keywords'].get('use_item', {}).get(lang, [])
    action_lower = action.lower()
    heroname = urllib.parse.unquote(heroname)
    heroname = bleach.clean(heroname, tags=[], strip=True)

    if not re.match(r'^[a-zA-Zа-яА-ЯїіІЇєЄґҐ\s\'-]+$', heroname):
        heroname = get_translation("character.unknown_hero", lang)

    normalized_inventory = [
        {"name": str(item["name"]), "quantity": item.get("quantity", 1)}
        if isinstance(item, dict) else {"name": str(item), "quantity": 1}
        for item in inventory
    ]

    for item in normalized_inventory:
        item_name = item["name"].lower()
        if any(keyword in action_lower for keyword in use_keywords) and item_name in action_lower:
            if item["quantity"] < 1:
                return {
                    "consumedItems": [],
                    "persistentItems": normalized_inventory,
                    "newItems": [],
                    "effects": {"hp": 0, "strength": 0, "dexterity": 0, "constitution": 0, "intelligence": 0, "wisdom": 0, "charisma": 0},
                    "warnings": [get_translation("inventory.insufficient_quantity", lang)],
                    "reply": ""
                }
            effects = game_data["items"].get(item_name, {}).get("effects", {})
            return {
                "consumedItems": [{"name": item_name, "quantity": 1}],
                "persistentItems": [
                    {"name": i["name"], "quantity": i["quantity"] - 1 if i["name"] == item_name else i["quantity"]}
                    for i in normalized_inventory if i["quantity"] > (1 if i["name"] == item_name else 0)
                ],
                "newItems": [],
                "effects": effects,
                "warnings": [],
                "reply": get_translation("inventory.used", lang).format(item=item_name)
            }

    return {
        "consumedItems": [],
        "persistentItems": normalized_inventory,
        "newItems": [],
        "effects": {"hp": 0, "strength": 0, "dexterity": 0, "constitution": 0, "intelligence": 0, "wisdom": 0, "charisma": 0},
        "warnings": [],
        "reply": ""
    }

def detect_location_from_action(action: str, lang: str) -> str:
    """Визначає нову локацію на основі дії користувача та ключових слів з перекладу."""
    game_data = load_game_data()
    location_keywords = game_data.get('action_keywords', {}).get('location', {}).get(lang, [])
    move_keywords = game_data.get('action_keywords', {}).get('move', {}).get(lang, [])
    action_lower = action.lower()
    # Якщо є слова руху + слова локації — повертаємо першу знайдену локацію
    if any(mw in action_lower for mw in move_keywords):
        for loc in location_keywords:
            if loc in action_lower:
                return loc
    return None

# Ендпоінти
@app.route('/game_data', methods=['GET'])
@limiter.limit("100 per minute")
def get_game_data():
    lang = get_locale()
    try:
        game_data = load_game_data()
        return jsonify(game_data), 200
    except Exception as e:
        logging.error(f"Error loading game_data: {e}")
        return jsonify({"error": get_translation("errors.server_error", lang, "Server error")}), 500

@app.route('/start_prompt', methods=['POST'])
@limiter.limit("10 per minute")
def start_prompt():
    lang = get_locale()
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Request too large")}), 413

    try:
        data = request.get_json(force=True)
        if not validate_json(data, SCHEMAS['start_prompt']):
            return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400
    except Exception:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400

    heroname = bleach.clean(data.get("heroname", get_translation("character.unknown_hero", lang)))
    race = data.get("race", "human")
    characterClass = data.get("characterClass", "none")

    prompt = PROMPTS['start_prompt'][lang].format(
        heroname=heroname,
        race=race,
        characterClass=characterClass
    )

    try:
        response = MODEL.generate_content(prompt)
        response_text = bleach.clean(response.text.strip())
        goal_match = re.search(r"\[GOAL:([^\]]*)\]", response_text)
        goal = goal_match.group(1).strip() if goal_match else get_translation("game.default_goal", lang)
        intro = re.sub(r"\s*\[GOAL:[^\]]*\]\s*", "", response_text).strip()

        cache_key = f"start_prompt_{heroname}_{race}_{characterClass}_{lang}"
        cache.set(cache_key, {"intro": intro, "goal": goal}, timeout=3600)

        return jsonify({"intro": intro, "goal": goal}), 200
    except Exception as e:
        logging.error(f"Error in start_prompt: {e}")
        return jsonify({"error": get_translation("errors.server_error", lang).format(error=str(e))}), 500

@app.route('/npc', methods=['POST'])
@limiter.limit("10 per minute")
def npc_response():
    lang = get_locale()
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Request too large")}), 413

    try:
        data = request.get_json(force=True)
        if not validate_json(data, SCHEMAS['npc']):
            return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400
    except Exception:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400

    heroname = bleach.clean(data.get("heroname", get_translation("character.unknown_hero", lang)))
    npc_name = bleach.clean(data.get("npcName", ""))
    context = data.get("context", "")
    race = data.get("race", "human")
    characterClass = data.get("characterClass", "none")
    stored_npcs = data.get("stored_npcs", {})

    game_data = load_game_data()
    if not npc_name:
        npc_name = generate_unique_fantasy_name(lang, stored_npcs)

    def generate_unique_fantasy_name(lang: str, stored_npcs: Dict) -> str:
        for _ in range(10):
            name = MODEL.generate_content(f"Generate a unique fantasy name for an NPC in {lang}").text.strip()
            if name not in stored_npcs.values():
                return name
        return f"NPC_{uuid.uuid4().hex[:8]}"

    prompt = PROMPTS['create_npc_prompt'][lang].format(
        npcName=npc_name,
        context=context,
        heroname=heroname,
        race=race,
        characterClass=characterClass
    )

    try:
        response = MODEL.generate_content(prompt)
        response_text = bleach.clean(response.text.strip())
        try:
            npc_data = json.loads(response_text.replace('```json', '').replace('```', ''))
        except json.JSONDecodeError:
            npc_data = generate_fallback_npc(npc_name, context, lang)

        required_fields = ["name", "hp", "ac", "attackBonus", "initialMessage"]
        if not all(field in npc_data for field in required_fields):
            npc_data = generate_fallback_npc(npc_name, context, lang)

        npc_data.update({
            "hp": max(10, min(100, int(npc_data.get("hp", 20)))),
            "ac": max(10, min(20, int(npc_data.get("ac", 12)))),
            "attackBonus": int(npc_data.get("attackBonus", 0)),
            "damageDice": npc_data.get("damageDice", "d6"),
            "initialMessage": npc_data["initialMessage"][:200],
            "id": str(uuid.uuid4())
        })

        return jsonify(npc_data), 200
    except Exception as e:
        logging.error(f"Error in npc_response: {e}")
        return jsonify(generate_fallback_npc(npc_name, context, lang)), 500

def generate_fallback_npc(npc_name: str, context: str, lang: str) -> Dict:
    game_data = load_game_data()
    name_lower = npc_name.lower()
    dragon_keywords = game_data['check_keywords']['dragon'].get(lang, [])
    wolf_keywords = game_data['check_keywords']['wolf'].get(lang, [])
    goblin_keywords = game_data['check_keywords']['goblin'].get(lang, [])

    if any(k in name_lower for k in dragon_keywords):
        return {
            "name": npc_name,
            "hp": 100,
            "ac": 18,
            "attackBonus": 8,
            "damageDice": "d10",
            "initialMessage": get_translation("npc.default_message", lang),
            "id": str(uuid.uuid4())
        }
    elif any(k in name_lower for k in goblin_keywords):
        return {
            "name": npc_name,
            "hp": 15,
            "ac": 12,
            "attackBonus": 2,
            "damageDice": "d6",
            "initialMessage": get_translation("npc.default_message", lang),
            "id": str(uuid.uuid4())
        }
    elif any(k in name_lower for k in wolf_keywords):
        return {
            "name": npc_name,
            "hp": 20,
            "ac": 12,
            "attackBonus": 4,
            "damageDice": "d6",
            "initialMessage": get_translation("npc.default_message", lang),
            "id": str(uuid.uuid4())
        }
    return {
        "name": npc_name,
        "hp": 20,
        "ac": 12,
        "attackBonus": 0,
        "damageDice": "d6",
        "initialMessage": get_translation("npc.default_message", lang),
        "id": str(uuid.uuid4())
    }

@app.route('/combat', methods=['POST'])
@limiter.limit("10 per minute")
def combat():
    lang = get_locale()
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Request too large")}), 413

    try:
        data = request.get_json(force=True)
        if not validate_json(data, SCHEMAS['combat']):
            return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400
    except Exception:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400

    action = data.get("action", "")
    npc = data.get("npc", {})
    player_stats = data.get("player_stats", {})
    player_hp = float(data.get("player_hp", 30))
    npc_hp = float(data.get("npc_hp", 0))
    weapon = data.get("weapon", "Sword")
    damage_dice = data.get("damage_dice", "d4")
    attack_bonus = float(data.get("attack_bonus", 0))
    location = data.get("location", "tower_room")

    # Визначаємо нову локацію на основі дії
    new_location = detect_location_from_action(action, lang)
    if new_location:
        location = new_location

    if not npc or not all(key in npc for key in ["hp", "ac", "name"]):
        return jsonify({"error": get_translation("errors.no_enemy", lang)}), 400

    history = []
    d20 = random.randint(1, 20)
    attack_roll = d20 + attack_bonus
    npc_ac = npc.get("ac", 10)

    game_data = load_game_data()
    attack_keywords = game_data['check_keywords'].get('attack_action', {}).get(lang, [])
    is_attack = any(keyword in action.lower() for keyword in attack_keywords)

    # Додаємо бонуси за скритність, яд, магію
    bonus = 0
    description = ""
    effects = []
    if 'скрит' in action.lower() or 'stealth' in action.lower():
        bonus += 2
        description += get_translation("combat.sneak_attack_bonus", lang)
        effects.append("скритна атака")
    if 'отрута' in action.lower() or 'poison' in action.lower():
        bonus += 2
        description += get_translation("combat.poison_bonus", lang)
        effects.append("отрута")
    if 'заклинання' in action.lower() or 'spell' in action.lower():
        bonus += 2
        description += get_translation("combat.powerful_spell_bonus", lang)
        effects.append("магія")

    npc_defeated_name = None
    if is_attack:
        # Початок бою
        history.append({
            "type": "reply",
            "text": f"---\nТи вступаєш у бій з {npc['name']}!"
        })
        history.append({
            "type": "reply",
            "text": f"Ти замахуєшся {weapon} і кидаєш d20: {d20} + бонус ({attack_bonus}) = {attack_roll} (броня ворога: {npc_ac})"
        })
        if d20 == 1:
            history.append({
                "type": "reply",
                "text": get_translation("combat.attack_miss", lang).format(
                    npcName=npc["name"], weapon=weapon, roll=attack_roll
                ) + " (Критична невдача!) Твоя атака не пробила броню ворога — {npcName} ухиляється."
            })
        elif d20 == 20 or attack_roll >= npc_ac:
            crit = d20 == 20
            history.append({
                "type": "reply",
                "text": "Твоя атака пробиває броню ворога!"
            })
            damage_base = roll_dice(damage_dice)
            damage_total = (damage_base + attack_bonus + bonus) * (2 if crit else 1)
            damage_text = f"Кидаєш кубик на урон: {damage_dice} = {damage_base} + бонуси ({attack_bonus + bonus})"
            if crit:
                damage_text += " ×2 (критичний удар)"
            damage_text += f" = {damage_total}"
            if effects:
                damage_text += f". Ти використовуєш: {', '.join(effects)}."
            damage_text += f"\nТи наносиш {damage_total} урону ворогу."
            npc_hp = max(0, npc_hp - damage_total)
            history.append({
                "type": "reply",
                "text": damage_text
            })
            if npc_hp <= 0:
                npc_defeated_name = npc["name"]
                death_desc = f"{npc['name']} падає на підлогу бездиханним, кров розтікається по камінню. Ти переміг ворога!"
                history.append({
                    "type": "reply",
                    "text": death_desc
                })
        else:
            history.append({
                "type": "reply",
                "text": get_translation("combat.attack_miss", lang).format(
                    npcName=npc["name"], weapon=weapon, roll=attack_roll
                ) + f" Твоя атака не пробила броню ворога — {npc['name']} ухиляється."
            })

    if npc_hp > 0:
        npc_d20 = random.randint(1, 20)
        npc_attack_roll = npc_d20 + npc.get("attackBonus", 0)
        player_ac = player_stats.get("ac", 10)
        history.append({
            "type": "reply",
            "text": f"---\nТепер {npc['name']} атакує у відповідь! Кидає d20: {npc_d20} + бонус ({npc.get('attackBonus', 0)}) = {npc_attack_roll} (твоя броня: {player_ac})"
        })
        if npc_d20 == 1:
            history.append({
                "type": "reply",
                "text": get_translation("combat.npc_attack_miss", lang).format(
                    npcName=npc["name"], roll=npc_attack_roll
                ) + " (Критична невдача NPC!)"
            })
        elif npc_d20 == 20 or npc_attack_roll >= player_ac:
            crit = npc_d20 == 20
            npc_damage_base = roll_dice(npc.get("damageDice", "d6"))
            npc_damage = npc_damage_base * (2 if crit else 1)
            player_hp = max(0, player_hp - npc_damage)
            npc_damage_text = f"Кидає кубик на урон: {npc.get('damageDice', 'd6')} = {npc_damage_base}"
            if crit:
                npc_damage_text += " ×2 (критичний удар)"
            npc_damage_text += f" = {npc_damage}"
            npc_damage_text += f"\nТи отримуєш {npc_damage} урону."
            history.append({
                "type": "reply",
                "text": get_translation("combat.npc_attack_success", lang).format(
                    npcName=npc["name"], roll=npc_attack_roll, damage=npc_damage, hp=player_hp
                ) + "\n" + npc_damage_text
            })
        else:
            history.append({
                "type": "reply",
                "text": get_translation("combat.npc_attack_miss", lang).format(
                    npcName=npc["name"], roll=npc_attack_roll
                ) + f" {npc['name']} промахується!"
            })

    return jsonify({
        "history": history,
        "player_hp": max(0, player_hp),
        "npc_hp": max(0, npc_hp),
        "is_defeated": player_hp <= 0,
        "is_victory": npc_hp <= 0,
        "npc_defeated_name": npc_defeated_name
    }), 200

@app.route('/gpt', methods=['POST'])
@limiter.limit("10 per minute")
def gpt_response():
    lang = get_locale()
    if request.content_length and request.content_length > 1024 * 1024:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Request too large")}), 413

    try:
        data = request.get_json(force=True)
        if not validate_json(data, SCHEMAS['gpt']):
            return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400
    except Exception:
        return jsonify({"error": get_translation("errors.server_request_error", lang).format(error="Invalid JSON")}), 400

    action = data.get("action", "")
    dice_result = float(data.get("dice_result", 0))
    difficulty = float(data.get("difficulty", 10))
    heroname = bleach.clean(data.get("heroname", get_translation("character.unknown_hero", lang)))
    race = data.get("race", "human")
    characterClass = data.get("characterClass", "none")
    intro = data.get("intro", "")
    goal = data.get("goal", get_translation("game.default_goal", lang))
    history = data.get("history", [])[:100]
    weapon = data.get("weapon", "Sword")
    inventory = data.get("inventory", [])
    stored_npcs = data.get("stored_npcs", {})
    npc_name = data.get("NPCName", None)

    game_data = load_game_data()
    dialog_keywords = game_data['check_keywords'].get('dialog_action', {}).get(lang, [])
    is_dialog = any(keyword in action.lower() for keyword in dialog_keywords)

    inv_result = process_inventory_use(action, inventory, lang, heroname)
    new_inventory = inv_result["persistentItems"]
    consumed_items = inv_result["consumedItems"]
    effects = inv_result["effects"]
    warnings = inv_result["warnings"]
    inv_reply = inv_result["reply"]

    history_context = "\n".join(
        f"{e['action']}\n{e['reply']}" if e.get('type') == 'reply' else e.get('text', '')
        for e in history if isinstance(e, dict)
    ) or get_translation("game.no_history", lang)

    active_npc = None
    if npc_name:
        active_npc = stored_npcs.get(npc_name, generate_fallback_npc(npc_name, action, lang))
        stored_npcs[active_npc["id"]] = active_npc

    format_args = {
        "active_npc": active_npc["name"] if active_npc else "",
        "heroname": heroname,
        "race": race,
        "characterClass": characterClass,
        "new_inventory": [item["name"] for item in new_inventory],
        "weapon": weapon,
        "goal": goal,
        "action": action,
        "intro": intro,
        "history_context": history_context,
        "characterTraits": active_npc.get("characterTraits", ["neutral"])[0] if active_npc else "",
        "result": dice_result,
        "difficulty": difficulty,
        "result_status": "success" if dice_result >= difficulty else "failure"
    }
    prompt = PROMPTS['action_dialog_prompt' if is_dialog else 'action_prompt'][lang].format(**format_args)

    try:
        response = MODEL.generate_content(prompt)
        response_text = bleach.clean(response.text.strip())
        reply = response_text

        is_goal_achieved = "[META_ACHIEVED]" in response_text
        final_description = ""
        new_items = []
        new_npc = None

        if is_goal_achieved:
            reply = re.sub(r"\s*\[META_ACHIEVED\]\s*", "", response_text).strip()
            final_description = reply.split("[FINAL_DESCRIPTION]")[-1].strip() if "[FINAL_DESCRIPTION]" in reply else reply

        new_item_matches = re.findall(r"\[NEW_ITEM:([^\]]*)\]", reply)
        new_items = [{"name": item.strip(), "quantity": 1} for item in new_item_matches if item.strip()]
        reply = re.sub(r"\s*\[NEW_ITEM:[^\]]*\]\s*", "", reply).strip()

        npc_match = re.search(r"\[NEW_NPC:([^,]+), hp=(\d+), ac=(\d+), attackBonus=(\d+)\]", reply)
        if npc_match and (not active_npc or active_npc.get("hp", 0) <= 0):
            new_npc = {
                "name": npc_match.group(1).strip(),
                "hp": int(npc_match.group(2)),
                "ac": int(npc_match.group(3)),
                "attackBonus": int(npc_match.group(4)),
                "damageDice": "d6",
                "id": str(uuid.uuid4())
            }
            stored_npcs[new_npc["id"]] = new_npc
            reply = re.sub(r"\s*\[NEW_NPC:[^\]]*\]\s*", "", reply).strip()

        # Видаляємо теги [SUCCESS], [FAILURE], [ACTION] тощо
        reply = re.sub(r"\s*\[(SUCCESS|FAILURE|ACTION|DAMAGE:\s*\d+)\]\s*", "", reply).strip()

        response_data = {
            "reply": reply,
            "isGoalAchieved": is_goal_achieved,
            "finalDescription": final_description,
            "newItems": new_items,
            "removedItems": [item["name"] for item in consumed_items],
            "effects": effects,
            "warnings": warnings,
            "stored_npcs": stored_npcs
        }
        if new_npc:
            response_data["npc"] = new_npc
        elif active_npc:
            response_data["npc"] = active_npc

        return jsonify(response_data), 200
    except Exception as e:
        logging.error(f"Error in gpt_response: {e}")
        return jsonify({"error": get_translation("errors.server_error", lang).format(error=str(e))}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(server_port), debug=True)