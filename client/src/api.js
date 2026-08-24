import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hirehub_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function apiMessage(error) {
  return error?.response?.data?.message || error?.message || "Something went wrong.";
}
