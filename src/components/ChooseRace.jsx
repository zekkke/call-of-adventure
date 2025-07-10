import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import './ChooseRace.css';
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

const ChooseRace = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { state } = useLocation();
  const [races, setRaces] = useState({});
  const [selectedRace, setSelectedRace] = useState(null);
  const [isFading, setIsFading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Отримуємо heroname
  const savedHeroname = localStorage.getItem('heroname') || sessionStorage.getItem('heroname');
  const { heroname: stateHeroname } = state || {};
  const rawHeroname = stateHeroname || savedHeroname || t('character.unknown_hero');
  const heroname = DOMPurify.sanitize(rawHeroname);

  // Завантаження рас із game_data.json
  useEffect(() => {
    fetch(`http://192.168.31.190:5000/game_data`, {
      headers: { 'Accept-Language': i18n.language },
    })
      .then((response) => response.json())
      .then((data) => setRaces(data.races))
      .catch((error) => console.error('Error fetching races:', error));
  }, [i18n.language]);

  // Анімація завантаження
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Функція для форматування бонусів
  const formatBonuses = (bonuses) => {
    return Object.entries(bonuses)
      .map(([stat, value]) => `${t(`stats.${stat}`)}: ${value > 0 ? '+' : ''}${value}`)
      .join(', ');
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

  // Вибір раси
  const handleChooseRace = (raceKey, bonuses, hp) => {
    if (!heroname || heroname === t('character.unknown_hero')) {
      alert(t('errors.no_hero_name'));
      handleNavigate('/choose-name');
      return;
    }
    setSelectedRace(raceKey);
    const raceData = { race: raceKey, bonuses, hp };
    localStorage.setItem('race', JSON.stringify(raceData));
    localStorage.setItem('heroname', heroname);
    sessionStorage.setItem('heroname', heroname);
    handleNavigate('/choose-class', { heroname, ...raceData });
  };

  // Повернення назад
  const handleBack = () => {
    handleNavigate('/choose-name', { heroname });
  };

  return (
    <div className="choose-race-container">
      <div
        className={`fade-overlay ${
          isFading ? 'fade-out' : isLoaded ? 'fade-in-out' : ''
        }`}
      ></div>
      <h1 dangerouslySetInnerHTML={{ __html: t('titles.choose_race', { heroname }) }} />
      <button className="back-button" onClick={handleBack}>
        {t('buttons.back')}
      </button>
      {isLoading && (
        <div id="loading">
          <img src={loadingGif} alt={t('loading.alt')} />
        </div>
      )}
      <div className="races-list">
        {Object.entries(races).map(([raceKey, race]) => (
          <div
            key={raceKey}
            className={`race ${selectedRace === raceKey ? 'selected' : ''}`}
            onClick={() => handleChooseRace(raceKey, race.bonuses, race.hp)}
          >
            <div className="race-details">
              <div className="race-name">{race.description[i18n.language]}</div>
              <div className="race-bonuses">{formatBonuses(race.bonuses)}</div>
              <div className="race-hp">{t('character.hp')}: {race.hp}</div>
            </div>
            <img
              src={raceImages[raceKey] || raceImages['human']} // Запасне зображення
              alt={race.description[i18n.language]}
              className="race-image"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChooseRace;