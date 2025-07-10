import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import './Game.css';
import loadingGif from '../assets/loading.gif';

// Динамічне завантаження зображень із папки assets/races
const raceImages = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/races/*.png', { eager: true }))
    .map(([path, module]) => {
      const key = path.match(/\/([^/]+)\.png$/)?.[1]?.toLowerCase();
      return key ? [key, module.default] : null;
    })
    .filter(Boolean)
);

const apiBaseUrl = 'http://192.168.31.190:5000';

const Game = () => {
  const { t, i18n } = useTranslation();
  const { state } = useLocation();
  const navigate = useNavigate();
  const logRef = useRef(null);
  const [gameData, setGameData] = useState({ races: {}, classes: {}, check_keywords: {} });
  const [history, setHistory] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [action, setAction] = useState('');
  const [isAdventureCompleted, setIsAdventureCompleted] = useState(false);
  const [finalDescription, setFinalDescription] = useState('');
  const [npc, setNpc] = useState(null);
  const [npcHP, setNpcHP] = useState(0);
  const [isInCombat, setIsInCombat] = useState(false);
  const [isCharacterCardOpen, setIsCharacterCardOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [playerHP, setPlayerHP] = useState(30);
  const [playerAC, setPlayerAC] = useState(10);
  const [npcIntroduced, setNpcIntroduced] = useState(false);
  const [npcs, setNpcs] = useState({});
  const [isFading, setIsFading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Ініціалізація даних гри
  const savedGame = JSON.parse(localStorage.getItem('gameState')) || {};
  const initialState = state || savedGame;
  const {
    heroname: stateHeroname,
    race: stateRace,
    characterClass: stateClass,
    characterStats: stateStats,
    characterInventory: stateInventory,
    intro: stateIntro,
    goal: stateGoal,
  } = initialState;
  const heroname = DOMPurify.sanitize(stateHeroname || savedGame.heroname || t('character.unknown'));
  const race = stateRace || savedGame.race || 'human';
  const characterClass = stateClass || savedGame.characterClass || 'none';
  const characterStats = stateStats || savedGame.characterStats || {};
  const intro = stateIntro || savedGame.intro || t('game.default_intro');
  const goal = stateGoal || savedGame.goal || t('game.default_goal');

  // Завантаження game_data.json
  useEffect(() => {
    fetch(`${apiBaseUrl}/game_data`, {
      headers: { 'Accept-Language': i18n.language },
    })
      .then((response) => response.json())
      .then((data) => setGameData(data))
      .catch((error) => console.error('Error fetching game data:', error));
  }, [i18n.language]);

  // Ініціалізація стану гри
  useEffect(() => {
    if (!heroname || !race || !characterClass || !characterStats || Object.keys(characterStats).length === 0) {
      alert(t('game.choose_character'));
      navigate('/choose-name');
      return;
    }

    setHistory(savedGame.history || [{ type: 'reply', text: intro }]);
    setInventory(
      savedGame.inventory?.map((item) => typeof item === 'string' ? { name: item, quantity: 1 } : item) ||
      stateInventory?.map((item) => typeof item === 'string' ? { name: item, quantity: 1 } : item) || []
    );
    setStats(characterStats);
    setPlayerHP(savedGame.hp || characterStats.hp || 30);
    setPlayerAC(savedGame.ac || characterStats.ac || 10);
    setIsAdventureCompleted(savedGame.isAdventureCompleted || false);
    setFinalDescription(savedGame.finalDescription || '');
    setNpc(savedGame.npc || null);
    setNpcHP(savedGame.npcHP || 0);
    setNpcs(savedGame.npcs || {});
    setIsLoaded(true);
  }, []);

  // Збереження даних гри
  useEffect(() => {
    if (isAdventureCompleted) return;

    const gameState = {
      heroname,
      race,
      characterClass,
      characterStats: stats,
      characterInventory: inventory,
      intro,
      goal,
      history: history.slice(-20), // Обмежуємо історію
      hp: playerHP,
      ac: playerAC,
      isAdventureCompleted,
      finalDescription,
      npc,
      npcHP,
      npcs,
    };

    try {
      localStorage.setItem('gameState', JSON.stringify(gameState));
    } catch (error) {
      console.error('Error saving game state:', error);
    }
  }, [heroname, race, characterClass, stats, inventory, intro, goal, history, playerHP, playerAC, isAdventureCompleted, finalDescription, npc, npcHP, npcs]);

  // Автоскрол до кінця логу
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [history]);

  // Функція для кидка кубика
  const rollDice = (sides) => Math.floor(Math.random() * sides) + 1;

  // Визначення типу дії
  const detectActionType = (text) => {
    const lower = text.toLowerCase();
    const { check_keywords } = gameData;
    if (!check_keywords) return 'generic';

    if (check_keywords.attack_action?.[i18n.language]?.some(w => lower.includes(w.toLowerCase()))) return 'attack';
    if (check_keywords.dialog_action?.[i18n.language]?.some(w => lower.includes(w))) return 'dialog';
    return 'generic';
  };

  // Визначення характеристики та складності
  const estimateDifficultyAndStat = (text) => {
    const lower = text.toLowerCase();
    const { check_keywords } = gameData;
    if (!check_keywords) return { difficulty: 10, stat: 'none', bonus: 0 };

    for (const stat of Object.keys(check_keywords)) {
      if (stat === 'difficulty' && check_keywords[stat][i18n.language]?.some(w => lower.includes(w))) {
        return {
          difficulty: check_keywords.difficulty.medium.dc || 15,
          stat,
          bonus: stats[stat] || 0,
        };
      }
    }

    if (check_keywords.difficulty.hard?.[i18n.language]?.some(w => lower.includes(w))) {
      return { difficulty: check_keywords.difficulty.hard.dc || 20, stat: 'none', bonus: 0 };
    }
    if (check_keywords.difficulty.medium?.[i18n.language]?.some(w => lower.includes(w))) {
      return { difficulty: check_keywords.difficulty.medium.dc || 15, stat: 'none', bonus: 0 };
    }
    if (check_keywords.difficulty.easy?.[i18n.language]?.some(w => lower.includes(w))) {
      return { difficulty: check_keywords.difficulty.easy.dc || 10, stat: 'none', bonus: 0 };
    }

    return { difficulty: 10, stat: 'none', bonus: 0 };
  };

  // Обробка бою
  const handleCombat = async (actionText = '') => {
    if (!npc) {
      setHistory(prev => [...prev, { type: 'error', text: t('errors.no_enemy') }]);
      setIsCombat(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`${apiBaseUrl}/combat?language=${i18n.language}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          action: actionText,
          npc,
          player_stats: stats,
          player_hp: playerHP,
          npc_hp: npcHP,
          weapon: stats.weapon,
          damage_dice: stats.damageDice,
          attack_bonus: stats.attackBonus,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();

      setHistory(prev => [...prev, ...data.history.map(h => ({ ...h, text: DOMPurify.sanitize(h.text) }))]);
      setPlayerHP(data.player_hp);
      setNpcHP(data.npc_hp);
      setIsInCombat(true);

      if (data.is_defeated) {
        const defeatMessage = t('game.defeat_message');
        setHistory(prev => [...prev, { type: 'reply', text: defeatMessage }]);
        setIsAdventureCompleted(true);
        setFinalDescription(defeatMessage);
        localStorage.removeItem('gameState');
        localStorage.removeItem('npcs');
      } else if (data.is_victory) {
        const finalMessage = t('game.final_message', { npcName: npc.name });
        setHistory(prev => [...prev, { type: 'reply', text: finalMessage }]);
        setNpc(null);
        setNpcIntroduced(false);
        setIsInCombat(false);
        setIsAdventureCompleted(true);
        setFinalDescription(finalMessage);

        const completedAdventure = {
          heroname,
          race,
          characterClass,
          goal,
          finalDescription: finalMessage,
          inventory,
          history: [...history, ...data.history.map(h => ({ type: 'reply', text: h.text })), { type: 'reply', text: finalMessage }],
          completedAt: new Date().toISOString(),
        };
        const completedAdventures = JSON.parse(localStorage.getItem('completedAdventures')) || [];
        completedAdventures.push(completedAdventure);
        localStorage.setItem('completedAdventures', JSON.stringify(completedAdventures));
        localStorage.removeItem('gameState');
        localStorage.removeItem('npcs');
      }

      if (data.location && data.locationLabel) {
        setLocation(data.location);
        setLocationLabel(data.locationLabel);
      }
    } catch (error) {
      console.error('Combat error:', error);
      setHistory(prev => [...prev, { type: 'error', text: t('errors.server_request_error', { error: error.message }) }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Відправка дії
  const sendAction = async () => {
    if (!action.trim()) return;
    if (isAdventureCompleted) {
      setHistory(prev => [...prev, { type: 'error', text: t('errors.adventure_already_completed') }]);
      setAction('');
      return;
    }

    const validatedHeroname = DOMPurify.sanitize(heroname);
    const actionType = detectActionType(action);
    const { difficulty, stat, bonus } = estimateDifficultyAndStat(action);
    const dice = rollDice(20);
    const total = dice + bonus;
    const actionText = t('game.action_attempt', {
      action,
      dice,
      stat: stat !== 'none' ? t(`stats.${stat}`) : t('game.no_stat'),
      bonus,
      total,
      difficulty,
    });

    let newHistory = [...history, { type: 'action', text: actionText }];

    try {
      setIsLoading(true);
      if (actionType === 'attack') {
        if (npc && npcHP > 0) {
          await handleCombat(action);
        } else {
          const attackKeywords = gameData.check_keywords?.attack_action?.[i18n.language] || [];
          const match = action.toLowerCase().match(new RegExp(`(?:${attackKeywords.join('|')})\\s+(.+)`, 'i'));
          const npcName = match?.[1]?.trim() || t('game.unknown_enemy');

          const npcResponse = await fetch(`${apiBaseUrl}/npc?language=${i18n.language}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              npcName,
              context: action,
              heroname: encodeURIComponent(validatedHeroname),
              race,
              characterClass,
              stored_npcs: npcs,
            }),
          });

          if (!npcResponse.ok) throw new Error(`HTTP error! Status: ${npcResponse.status}`);
          const npcData = await npcResponse.json();

          if (!npcData.hp || !npcData.ac || !npcData.attackBonus || !npcData.initialMessage) {
            throw new Error('Invalid NPC data');
          }

          const newNpc = {
            name: npcName,
            hp: npcData.hp,
            ac: npcData.ac,
            attackBonus: npcData.attackBonus,
            damageDice: npcData.damageDice,
            id: npcData.id || Date.now().toString(),
          };
          setNpcs(prev => ({ ...prev, [newNpc.id]: newNpc }));
          setNpc(newNpc);
          setNpcHP(newNpc.hp);
          setNpcIntroduced(true);

          const initialHistory = [...newHistory, { type: 'reply', text: DOMPurify.sanitize(npcData.initialMessage) }];
          setHistory(initialHistory);
          await handleCombat(action);
        }
      } else {
        const response = await fetch(`${apiBaseUrl}/gpt?language=${i18n.language}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            action,
            dice_result: total,
            difficulty,
            heroname: encodeURIComponent(validatedHeroname),
            race,
            characterClass,
            intro: intro.substring(0, 1000),
            goal,
            history: history.slice(-20).map(entry => ({
              action: entry.type === 'action' ? entry.text : '',
              reply: entry.type === 'reply' ? entry.text : '',
              text: entry.type === 'system' || entry.type === 'warning' || entry.type === 'error' ? entry.text : '',
              type: entry.type,
            })),
            weapon: stats.weapon,
            inventory: inventory.map(item => ({ name: item.name, quantity: item.quantity })),
            NPCName: npc?.name,
            stored_npcs: npcs,
          }),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();

        if (!data.reply) throw new Error('Invalid response');

        newHistory.push({ type: 'reply', text: DOMPurify.sanitize(data.reply) });

        if (data.warnings) {
          newHistory.push({ type: 'warning', text: DOMPurify.sanitize(data.warnings.join(', ')) });
        }

        if (data.effects) {
          const e = data.effects;
          if (e.hp) {
            const healedHP = Math.min(100, playerHP + e.hp);
            setPlayerHP(healedHP);
            newHistory.push({ type: 'reply', text: t('game.hp_restored', { hp: e.hp, totalHP: healedHP }) });
          }
          setStats(prev => ({
            ...prev,
            strength: (prev.strength || 0) + (e.strength || 0),
            dexterity: (prev.dexterity || 0) + (e.dexterity || 0),
            constitution: (prev.constitution || 0) + (e.constitution || 0),
            intelligence: (prev.intelligence || 0) + (e.intelligence || 0),
            wisdom: (prev.wisdom || 0) + (e.wisdom || 0),
            charisma: (prev.charisma || 0) + (e.charisma || 0),
          }));
        }

        if (data.newItems?.length > 0) {
          const newItems = data.newItems.map(item => ({ name: item.name || item, quantity: item.quantity || 1 }));
          setInventory(prev => [...prev, ...newItems]);
          newHistory.push({ type: 'reply', text: t('game.new_items', { items: newItems.map(item => `${item.name} (${item.quantity})`).join(', ') }) });
        }

        if (data.removedItems?.length > 0) {
          const removedItems = data.removedItems.map(item => item.name || item);
          setInventory(prev => prev.filter(item => !removedItems.includes(item.name)));
          removedItems.forEach(item => {
            newHistory.push({ type: 'reply', text: t('game.item_removed', { item }) });
          });
        }

        if (data.npc) {
          const newNpc = {
            name: data.npc.name,
            hp: data.npc.hp || 25,
            ac: data.npc.ac || 13,
            attackBonus: data.npc.attackBonus || 4,
            damageDice: data.npc.damageDice || 'd6',
            id: data.npc.id || Date.now().toString(),
          };
          setNpcs(prev => ({ ...prev, [newNpc.id]: newNpc }));
          setNpc(newNpc);
          setNpcHP(newNpc.hp);
          if (!npcIntroduced) {
            newHistory.push({ type: 'reply', text: t('combat.encounter', { npcName: newNpc.name, hp: newNpc.hp, ac: newNpc.ac }) });
            setNpcIntroduced(true);
          }
        }

        if (data.stored_npcs) {
          setNpcs(data.stored_npcs);
        }

        if (data.location && data.locationLabel) {
          setLocation(data.location);
          setLocationLabel(DOMPurify.sanitize(data.locationLabel));
        }

        if (data.isGoalAchieved) {
          setIsAdventureCompleted(true);
          const finalDesc = DOMPurify.sanitize(data.finalDescription || t('game.default_final_description'));
          setFinalDescription(finalDesc);
          newHistory = [{ type: 'reply', text: finalDesc }];

          const completedAdventure = {
            heroname: validatedHeroname,
            race,
            characterClass,
            goal,
            finalDescription: finalDesc,
            inventory,
            history: newHistory,
            completedAt: new Date().toISOString(),
          };
          const completedAdventures = JSON.parse(localStorage.getItem('completedAdventures')) || [];
          completedAdventures.push(completedAdventure);
          localStorage.setItem('completedAdventures', JSON.stringify(completedAdventures));
          localStorage.removeItem('gameState');
          localStorage.removeItem('npcs');
        }

        setHistory(newHistory);
      }
    } catch (error) {
      console.error('Action error:', error);
      newHistory.push({ type: 'error', text: t('errors.server_request_error', { error: error.message }) });
      setHistory(newHistory);
    } finally {
      setAction('');
      setIsLoading(false);
    }
  };

  // Тимчасовий NPC
  const createTempNpc = (npcName) => {
    const nameLower = npcName.toLowerCase();
    const dragonKeywords = gameData.check_keywords?.dragon?.[i18n.language] || ['дракон', 'dragon'];
    const wolfKeywords = gameData.check_keywords?.wolf?.[i18n.language] || ['вовк', 'wolf'];
    const goblinKeywords = gameData.check_keywords?.goblin?.[i18n.language] || ['гоблін', 'goblin'];

    let npc = { name: npcName, hp: 25, ac: 13, attackBonus: 4, damageDice: 'd6' };
    if (dragonKeywords.some(k => nameLower.includes(k.toLowerCase()))) {
      npc = { name: npcName, hp: 100, ac: 18, attackBonus: 8, damageDice: 'd10' };
    } else if (goblinKeywords.some(k => nameLower.includes(k.toLowerCase()))) {
      npc = { name: npcName, hp: 15, ac: 12, attackBonus: 2, damageDice: 'd6' };
    } else if (wolfKeywords.some(k => nameLower.includes(k.toLowerCase()))) {
      npc = { name: npcName, hp: 20, ac: 12, attackBonus: 4, damageDice: 'd6' };
    }
    npc.id = Date.now().toString();
    return npc;
  };

  // Обробка натискання Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAction();
    }
  };

  // Навігація з анімацією
  const handleNavigate = (path, state = {}) => {
    setIsFading(true);
    setIsLoading(true);
    setTimeout(() => {
      navigate(path, { state });
      setIsLoading(false);
    }, 1000);
  };

  // Анімація кнопок
  const buttonVariants = {
    hover: { scale: 1.05, transition: { duration: 0.3 } },
    tap: { scale: 0.95 },
  };

  return (
    <div className="game-container">
      <div
        className={`fade-overlay ${
          isFading ? 'fade-out' : isLoaded ? 'fade-in-out' : ''
        }`}
      ></div>
      {isLoading && (
        <div id="loading">
          <img src={loadingGif} alt={t('loading.alt')} />
        </div>
      )}

      <motion.button
        className="main-menu-button"
        onClick={() => handleNavigate('/')}
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
        title={t('buttons.main_menu_icon_title')}
      >
        🏠
      </motion.button>

      <div className="race-icon" onClick={() => setIsCharacterCardOpen(!isCharacterCardOpen)}>
        <img
          src={raceImages[race] || raceImages['human']}
          alt={gameData.races[race]?.description[i18n.language] || t('character.unknown_race')}
        />
      </div>

      {isCharacterCardOpen && (
        <motion.div
          className="character-card"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
        >
          <h2>{heroname}</h2>
          <p>{t('character.race', { race: gameData.races[race]?.description[i18n.language] || t('character.unknown_race') })}</p>
          <p>{t('character.class', { class: gameData.classes[characterClass]?.description[i18n.language] || t('character.unknown_class') })}</p>
          <p>{t('character.health', { hp: playerHP })}</p>
          <p>{t('character.armor', { ac: playerAC })}</p>
          <p>
            {t('character.stats', {
              strength: stats.strength || 0,
              dexterity: stats.dexterity || 0,
              constitution: stats.constitution || 0,
              intelligence: stats.intelligence || 0,
              wisdom: stats.wisdom || 0,
              charisma: stats.charisma || 0,
            })}
          </p>
          <p>{t('character.abilities', { abilities: stats.abilities?.join(', ') || t('character.no_abilities') })}</p>
          <p>{t('character.weapon', { weapon: stats.weapon || t('character.no_weapon') })}</p>
          <p>{t('character.damage', { damage: stats.damageDice || 'd4' })}</p>
          <p>{t('character.attack_bonus', { attackBonus: stats.attackBonus || 0 })}</p>
          <p>
            {inventory.length > 0
              ? t('character.inventory', { inventory: inventory.map(item => `${item.name} (${item.quantity})`).join(', ') })
              : t('character.inventory_empty')}
          </p>
        </motion.div>
      )}

      <div className="game-header">
        <h1>{t('game.title')}</h1>
        <h2>{t('game.goal', { goal })}</h2>
      </div>

      <div className="main-game-area">
        <div id="log" ref={logRef}>
          {history.map((entry, index) => (
            <div key={index} className={`history-entry ${entry.type}`}>
              {entry.text}
            </div>
          ))}
        </div>
      </div>

      {!isAdventureCompleted ? (
        <div className="action-area">
          <textarea
            id="action"
            placeholder={t('game.action_placeholder')}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isAdventureCompleted || isLoading}
          />
          <motion.button
            className="action-button"
            onClick={sendAction}
            disabled={isAdventureCompleted || isLoading}
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            {t('buttons.try_action')}
          </motion.button>
        </div>
      ) : (
        <motion.div
          className="end-message"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <h3>{t('game.adventure_completed')}</h3>
          <p>{finalDescription}</p>
          <motion.button
            onClick={() => {
              setHistory([]);
              setInventory([]);
              setAction('');
              setIsAdventureCompleted(false);
              setFinalDescription('');
              setNpc(null);
              setNpcIntroduced(false);
              setPlayerHP(stats.hp || 30);
              setNpcHP(0);
              setIsInCombat(false);
              setIsCharacterCardOpen(false);
              setNpcs({});
              localStorage.removeItem('gameState');
              localStorage.removeItem('completedAdventures');
              localStorage.removeItem('npcs');
              handleNavigate('/');
            }}
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            {t('buttons.new_adventure')}
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};

export default Game;