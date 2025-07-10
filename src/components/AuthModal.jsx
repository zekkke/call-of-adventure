import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../firebase';

const AuthModal = ({ isOpen, onClose, setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      setError('');
      onClose();
    } catch (err) {
      setError('Помилка входу через Google: ' + err.message);
    }
  };

  const handleEmailSignIn = async () => {
    try {
      if (isLogin) {
        const result = await signInWithEmailAndPassword(auth, email, password);
        setUser(result.user);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        setUser(result.user);
      }
      setError('');
      onClose();
    } catch (err) {
      if (err.code === 'auth/wrong-password') {
        setError('Невірний пароль');
      } else if (err.code === 'auth/user-not-found') {
        setError('Користувача не знайдено');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Email вже використовується');
      } else {
        setError('Помилка: ' + err.message);
      }
    }
  };

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setError('');
    setEmail('');
    setPassword('');
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, scale: 0.8, transition: { duration: 0.3 } }
  };

  const buttonVariants = {
    hover: { scale: 1.05, transition: { duration: 0.3 } },
    tap: { scale: 0.95 }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md"
          >
            <h2 className="text-2xl font-bold mb-6 text-center text-black">
              {isLogin ? 'Увійти' : 'Зареєструватися'}
            </h2>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-center mb-4"
              >
                {error}
              </motion.p>
            )}

            <div className="mb-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль"
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={handleEmailSignIn}
              className="w-full bg-blue-500 text-white p-3 rounded-lg mb-4"
            >
              {isLogin ? 'Увійти' : 'Зареєструватися'}
            </motion.button>

            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={handleGoogleSignIn}
              className="w-full bg-red-500 text-white p-3 rounded-lg mb-4"
            >
              Увійти через Google
            </motion.button>

            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={toggleForm}
              className="w-full text-blue-500 underline mb-4"
            >
              {isLogin ? 'Немає акаунта? Зареєструйся' : 'Вже є акаунт? Увійди'}
            </motion.button>

            <motion.button
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
              onClick={onClose}
              className="w-full bg-gray-300 text-black p-3 rounded-lg"
            >
              Закрити
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;