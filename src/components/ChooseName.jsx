// src/components/ChooseName.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './ChooseName.css';
import loadingGif from '../assets/loading.gif';

const ChooseName = () => {
  const { t } = useTranslation(); // Хук для доступу до перекладів
  const [heroname, setHeroname] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFading, setIsFading] = useState(false); // Стан для анімації переходу
  const [isLoaded, setIsLoaded] = useState(false); // Стан для анімації завантаження
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Фокус на інпут при завантаженні
  useEffect(() => {
    inputRef.current.focus();
    setIsLoaded(true); // Запускаємо анімацію завантаження
  }, []);

  const validateName = (name) => {
    // Дозволяємо літери, пробіли, дефіси; мінімум 2 символи
    const nameRegex = /^[a-zA-Zа-яА-ЯїіІЇєЄґҐ\s-]{2,50}$/;
    return nameRegex.test(name.trim());
  };

  // Функція для обробки переходу з анімацією
  const handleNavigate = (path, state = {}) => {
    setIsFading(true); // Запускаємо анімацію затемнення
    setIsLoading(true);
    setTimeout(() => {
      navigate(path, { state }); // Переходимо після завершення анімації (1 секунда)
    }, 1000); // Час анімації fadeOut
  };

  // Перевірка наявності символів, які не є літерами або пробілами
  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = heroname.trim();

    if (!trimmedName) {
      setError(t('errors.empty_name')); // Переклад: "Будь ласка, введіть ім’я персонажа!"
      return;
    }

    if (!validateName(trimmedName)) {
      setError(t('errors.invalid_name')); // Переклад: "Ім’я має містити лише літери, пробіли та бути від 2 до 50 символів!"
      return;
    }

    setError('');
    handleNavigate('/choose-race', { heroname: trimmedName });
  };

  const handleBack = () => {
    handleNavigate('/');
  };

  return (
    <div className="choose-name-container">
      
      <div
        className={`fade-overlay ${
          isFading ? 'fade-out' : isLoaded ? 'fade-in-out' : ''
        }`}
      ></div>

      <button className="back-button" onClick={handleBack}>
        {t('buttons.back')} 
      </button>
      {isLoading && (
        <div id="loading">
          <img src={loadingGif} alt={t('loading.alt')} /> 
        </div>
      )}
      <h1>{t('titles.create_hero')}</h1> 
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={heroname}
          onChange={(e) => setHeroname(e.target.value)}
          placeholder={t('placeholders.hero_name')} /* Переклад: "Ім’я персонажа" */
          maxLength={50}
          ref={inputRef}
        />
        <div className="button-group">
          <button type="submit">{t('buttons.choose_race')}</button> 
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default ChooseName;