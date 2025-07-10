import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import './ChooseClass.css';
import loadingGif from '../assets/loading.gif';

// Динамічне завантаження зображень із папки assets/classes
const classImages = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/classes/*.png', { eager: true }))
    .map(([path, module]) => {
      const key = path.match(/\/([^/]+)\.png$/)?.[1]?.toLowerCase();
      return key ? [key, module.default] : null;
    })
    .filter(Boolean)
);

const ChooseClass = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [classes, setClasses] = useState({});
  const [selectedClass, setSelectedClass] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Отримуємо дані з state або localStorage
  const savedHeroname = localStorage.getItem('heroname') || sessionStorage.getItem('heroname');
  const savedRace = localStorage.getItem('race');
  const { heroname: stateHeroname, race, raceBonuses, raceHP } = state || {};
  const heroname = DOMPurify.sanitize(stateHeroname || savedHeroname || t('character.unknown_hero'));
  const raceData = savedRace ? JSON.parse(savedRace) : { race, bonuses: raceBonuses, hp: raceHP };

  // Завантаження класів із game_data.json
  useEffect(() => {
    fetch(`http://192.168.31.190:5000/game_data`, {
      headers: { 'Accept-Language': i18n.language },
    })
      .then((response) => response.json())
      .then((data) => setClasses(data.classes))
      .catch((error) => console.error('Error fetching classes:', error));
  }, [i18n.language]);

  // Анімація завантаження
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Функція для форматування бонусів
  const formatBonuses = (bonuses) => {
    return Object.entries(bonuses)
      .filter(([, value]) => value !== 0)
      .map(([stat, value]) => `${t(`stats.${stat}`)}: ${value > 0 ? '+' : ''}${value}`)
      .join(', ');
  };

  // Функція для комбінування характеристик
  const combineStats = (raceBonuses, classBonuses) => {
    return {
      strength: (raceBonuses?.strength || 0) + (classBonuses?.strength || 0),
      dexterity: (raceBonuses?.dexterity || 0) + (classBonuses?.dexterity || 0),
      constitution: (raceBonuses?.constitution || 0) + (classBonuses?.constitution || 0),
      intelligence: (raceBonuses?.intelligence || 0) + (classBonuses?.intelligence || 0),
      wisdom: (raceBonuses?.wisdom || 0) + (classBonuses?.wisdom || 0),
      charisma: (raceBonuses?.charisma || 0) + (classBonuses?.charisma || 0),
    };
  };

  // Обробка навігації з анімацією
  const handleNavigate = (path, state = {}) => {
    setIsFading(true);
    setIsLoading(true);
    setTimeout(() => {
      navigate(path, { state });
      setIsLoading(false);
    }, 1000); // Час анімації (1 секунда)
  };

  // Вибір класу
  const handleSelectClass = async (classKey, classData) => {
    if (!heroname || !raceData.race || !raceData.bonuses || !raceData.hp) {
      alert(t('errors.no_hero_race_stats'));
      handleNavigate('/choose-name');
      return;
    }

    setSelectedClass(classKey);
    const combinedStats = {
      ...combineStats(raceData.bonuses, classData.bonuses),
      weapon: classData.weapon[i18n.language],
      damageDice: classData.damageDice,
      attackBonus: classData.attackBonus,
      abilities: classData.abilities[i18n.language],
      hp: raceData.hp,
      ac: classData.ac,
    };

    try {
      const response = await fetch(`http://192.168.31.190:5000/start_prompt?language=${i18n.language}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept-Language': i18n.language,
        },
        body: JSON.stringify({
          heroname,
          race: raceData.race,
          characterClass: classKey,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();

      if (data.error || !data.intro || !data.goal) {
        throw new Error(data.error || t('errors.invalid_intro_goal'));
      }

      const gameState = {
        heroname,
        race: raceData.race,
        characterClass: classKey,
        characterStats: combinedStats,
        characterInventory: classData.inventory[i18n.language],
        intro: data.intro,
        goal: data.goal,
      };

      localStorage.setItem('gameState', JSON.stringify(gameState));
      localStorage.setItem('heroname', heroname);
      sessionStorage.setItem('heroname', heroname);
      handleNavigate('/game', gameState);
    } catch (error) {
      alert(t('errors.server_request_error', { error: error.message }));
      setIsLoading(false);
      setIsFading(false);
    }
  };

  // Повернення назад
  const handleBack = () => {
    handleNavigate('/choose-race', {
      heroname,
      race: raceData.race,
      raceBonuses: raceData.bonuses,
      raceHP: raceData.hp,
    });
  };

  return (
    <div className="choose-class-container">
      <div
        className={`fade-overlay ${
          isFading ? 'fade-out' : isLoaded ? 'fade-in-out' : ''
        }`}
      ></div>
      <h1 dangerouslySetInnerHTML={{ __html: t('titles.choose_class', { heroname, race: raceData.race || t('character.unknown_race') }) }} />
      <button className="back-button" onClick={handleBack}>
        {t('buttons.back')}
      </button>
      {isLoading && (
        <div id="loading">
          <img src={loadingGif} alt={t('loading.alt')} />
        </div>
      )}
      <div className="classes-list">
        {Object.entries(classes).map(([classKey, cls]) => (
          <div
            key={classKey}
            className={`class ${selectedClass === classKey ? 'selected' : ''}`}
            onClick={() => handleSelectClass(classKey, cls)}
          >
            <div className="class-details">
              <div className="class-name">{cls.description[i18n.language]}</div>
              <div className="class-bonuses">{formatBonuses(cls.bonuses)}</div>
              <div className="class-abilities">{t('character.abilities', { abilities: cls.abilities[i18n.language].join(', ') })}</div>
              <div className="class-weapon">{t('character.weapon', { weapon: cls.weapon[i18n.language] })}</div>
              <div className="class-inventory">{t('character.inventory', { inventory: cls.inventory[i18n.language].join(', ') })}</div>
              <div className="class-ac">{t('character.armor', { ac: cls.ac })}</div>
            </div>
            <img
              src={classImages[classKey] || classImages['fighter']} // Запасне зображення
              alt={cls.description[i18n.language]}
              className="class-image"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChooseClass;