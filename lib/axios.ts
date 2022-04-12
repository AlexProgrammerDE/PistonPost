import axios from 'axios';
import {getSession} from "next-auth/react";

const instance = axios.create({
  baseURL: `/api/backend`,
});

instance.interceptors.request.use(async function (config) {
  const session = await getSession();

  console.log();
  if (!!session?.accessToken) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${session.accessToken}`,
    };
  }

  return config;
});

export default instance;
