import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Create an Axios instance
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '', // Empty means it will use relative path which vite proxies to localhost:8000
  withCredentials: true, // Important for sending/receiving HttpOnly cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach access token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for automatic token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Attempt to refresh token using the HttpOnly cookie
        const refreshResponse = await axios.post('/api/v1/auth/refresh', {}, {
          baseURL: import.meta.env.VITE_API_URL || '',
          withCredentials: true
        });
        
        const { access_token } = refreshResponse.data;
        
        // Update the Zustand store with the new access token
        useAuthStore.getState().setAuth(access_token, useAuthStore.getState().user!);
        
        // Retry the original request with the new token
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return apiClient(originalRequest);
        
      } catch (refreshError) {
        // If refresh fails (e.g. cookie expired), clear state and redirect to login
        useAuthStore.getState().clearAuth();
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
