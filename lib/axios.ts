import axios from "axios";

const clientAxios = axios.create({
  baseURL: `/api/backend`
});

export default clientAxios;
