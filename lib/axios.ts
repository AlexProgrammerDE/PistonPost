import axios from "axios";

const clientAxios = axios.create({
  baseURL: `/backend`
});

export default clientAxios;
