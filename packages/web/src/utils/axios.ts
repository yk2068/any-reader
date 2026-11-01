import axios from 'axios';
import { message } from 'ant-design-vue';
import { BASE_URL } from '@/constants';

const service = axios.create({
  withCredentials: false,
  baseURL: BASE_URL,
  timeout: 15000
});

service.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

service.interceptors.response.use(
  (response) => {
    const { showMsg = true } = response.config as any;

    const { code, msg } = response.data;
    // 本地阅读模式不做鉴权跳转
    if (code === 401 || code === 10001 || code === 10002) {
      return Promise.reject(response.data);
    }
    if (code === -1) {
      msg && showMsg && message.warning(msg);
      return Promise.reject(response.data);
    }
    return response.data;
  },
  (error) => {
    return Promise.reject(error);
  }
);
export default service;
