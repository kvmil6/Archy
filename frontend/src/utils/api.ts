import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const analyzeGraph = async (graphData: any) => {
  return api.post('/analyze', graphData, {
    responseType: 'stream', // For future streaming support in frontend if needed
  });
};

export const generateCode = async (graphData: any) => {
  return api.post('/generate', graphData);
};

export default api;
