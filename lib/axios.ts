import axios from 'axios';

const instance = axios.create({
  baseURL: `/api/backend`,
});

export default instance;
