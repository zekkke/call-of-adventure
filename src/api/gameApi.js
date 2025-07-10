// src/api/gameApi.js
import axios from 'axios';

const API_URL = 'http://localhost:10000';

export const startPrompt = async (characterName) => {
  try {
    const response = await axios.post(`${API_URL}/start_prompt`, { characterName });
    return response.data; // { intro, goal }
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Помилка сервера');
  }
};

export const sendAction = async (data) => {
  try {
    const response = await axios.post(`${API_URL}/gpt`, data);
    return response.data; // { reply, isGoalAchieved, finalDescription, newItems }
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Помилка сервера');
  }
};