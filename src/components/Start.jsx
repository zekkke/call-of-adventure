import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { auth } from '../firebase';
import { signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import './Start.css';
import logo from '../assets/logo.png';
import loginForm from '../assets/login-form.png';
import closeIcon from '../assets/close-icon.png';
import btngoogle from '../assets/google-icon.png';
import langScroll from '../assets/language-scroll.png';

const Start = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [isFading, setIsFading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [user, setUser] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Function to change language
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  // Show login form with opening animation
  const showForm = () => {
    setShowLoginForm(true);
    setIsOpening(true);
    setIsClosing(false);
  };

  // Start closing animation
  const closeForm = () => {
    setIsClosing(true);
    setIsOpening(false);
  };

  // Handle animation end
  const onAnimationEnd = (e) => {
    if (e.animationName === 'slide-out-blurred-br') {
      setShowLoginForm(false);
      setIsClosing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      // Debug logging
      if (user) {
        console.log('Користувач авторизований:', user);
        console.log('displayName:', user.displayName);
        console.log('email:', user.email);
      } else {
        console.log('Користувач не авторизований');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const savedGame = localStorage.getItem('currentGame');
    setHasSavedGame(!!savedGame);
    setIsLoaded(true);
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeForm();
    } catch (e) {
      alert(t('errors.server_error', { error: e.message }));
    }
  };

  const handleRegister = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      closeForm();
    } catch (e) {
      alert(t('errors.server_error', { error: e.message }));
    }
  };

  const handleGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      closeForm();
    } catch (e) {
      alert(t('errors.server_error', { error: e.message }));
    }
  };

  window.onerror = (message, source, lineno, colno, error) => {
    console.error(`Error: ${message} at ${source}:${lineno}:${colno}`);
    alert(t('errors.global_error'));
  };

  const handleNavigate = (path) => {
    if (!user) {
      return showForm();
    }
    setIsFading(true);
    setTimeout(() => {
      navigate(path);
    }, 1000);
  };

  const handleNewGame = () => {
    localStorage.removeItem('currentGame');
    setHasSavedGame(false);
    if (!user) {
      showForm(); // Open the new custom login panel
    } else {
      handleNavigate('/choose-name');
    }
  };

  const handleContinueGame = () => {
    handleNavigate('/game');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error(t('errors.logout_error', { error: err.message }));
    }
  };

  const buttonVariants = {
    hover: { scale: 1.1, transition: { duration: 0.3 } },
    tap: { scale: 0.95 }
  };

  return (
    <div className={`start-container ${showLoginForm ? 'blurred' : ''}`}>
      <div
        className={`fade-overlay ${
          isFading ? 'fade-out' : isLoaded ? 'fade-in-out' : ''
        }`}
      ></div>
      <div className="lang-selection" onClick={(e) => e.stopPropagation()}>
        <button
          className={`lang-btn ${i18n.language === 'uk' ? 'active' : ''}`}
          onClick={() => changeLanguage('uk')}
          aria-label="Українська"
        />
        <button
          className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
          onClick={() => changeLanguage('en')}
          aria-label="English"
        />
        <button
          className={`lang-btn ${i18n.language === 'ru' ? 'active' : ''}`}
          onClick={() => changeLanguage('ru')}
          aria-label="Русский"
        />
      </div>

      {isLoaded && (
        <>
          <div className="top-bar">
            {user ? (
              <motion.button
                className="custom-login-button"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
                onClick={handleLogout}
              >
                {t('buttons.logout')}
              </motion.button>
            ) : (
              <motion.button
                className="custom-login-button"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
                onClick={showForm}
              >
                {t('buttons.login')}
              </motion.button>
            )}
          </div>
          <div className="logo">
            <img src={logo} alt={t('start.logo_alt')} />
          </div>
          <div className="menu">
            <button onClick={handleNewGame}>{t('buttons.new_game')}</button>
            {hasSavedGame && (
              <button onClick={handleContinueGame}>{t('buttons.continue_game')}</button>
            )}
            <button onClick={() => handleNavigate('/rules')}>{t('buttons.rules')}</button>
          </div>

          {/* Login Modal */}
          {showLoginForm && (
            <>
              <div className="modal-backdrop" onClick={closeForm} />
              <div className="modal-wrapper">
                <div
                  className={`login-modal ${isOpening ? 'slide-in-blurred-tl' : isClosing ? 'slide-out-blurred-br' : ''}`}
                  onAnimationEnd={onAnimationEnd}
                  onClick={(e) => e.stopPropagation()}
                >
                  <img src={loginForm} className="login-bg" alt="" />
                  <button className="modal-close" onClick={closeForm}>
                    <img src={closeIcon} alt="Close" />
                  </button>
                  <div className="modal-content">
                    <h2>{t('login.title')}</h2>
                    <input
                      type="email"
                      placeholder={t('login.placeholder_email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder={t('login.placeholder_password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={handleLogin}
                      disabled={!email || !password}
                    >
                      {t('login.login')}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleRegister}
                      disabled={!email || !password}
                    >
                      {t('login.register')}
                    </button>
                    <button
                      className="btn-google"
                      onClick={handleGoogle}
                      aria-label="Увійти через Google"
                    >
                      <img src={btngoogle} alt="G" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Start;