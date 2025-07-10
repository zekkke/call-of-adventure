import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth } from './firebase';
import Start from './Start';
import Game from './components/Game';
import ChooseName from './components/ChooseName'; // Припускаємо, що у тебе є цей компонент
import Rules from './components/Rules'; // Припускаємо, що у тебе є цей компонент

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const ProtectedRoute = ({ children }) => {
    return user ? children : <Navigate to="/" />;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route
          path="/choose-name"
          element={
            <ProtectedRoute>
              <ChooseName />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game"
          element={
            <ProtectedRoute>
              <Game />
            </ProtectedRoute>
          }
        />
        <Route path="/rules" element={<Rules />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
};

export default App;