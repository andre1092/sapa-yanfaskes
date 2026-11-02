import axios from 'axios';
import { getSessionToken } from '../auth/session';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await getSessionToken()}`;
  return config;
});
