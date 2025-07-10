// src/App.jsx
import { Routes, Route } from 'react-router-dom';
import Start from './components/Start';
import ChooseName from './components/ChooseName';
import ChooseRace from './components/ChooseRace';
import ChooseClass from './components/ChooseClass';
import Rules from './components/Rules';
import Login from './components/Login';
import Game from './components/Game';


function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/choose-name" element={<ChooseName />} />
      <Route path="/choose-race" element={<ChooseRace />} />
      <Route path="/choose-class" element={<ChooseClass />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/login" element={<Login />} />
      <Route path="/game" element={<Game />} />
    </Routes>
  );
}

export default App;