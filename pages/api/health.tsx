import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

const apiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  await axios
    .get(`${process.env.ADMIN_ENDPOINT}/healthcheck`)
    .then((response) => {
      res.status(response.status).json(response.data);
    })
    .catch((error) => {
      console.error(error);
      res.status(error.response.status).send(error.response.data);
    });
};

// noinspection JSUnusedGlobalSymbols
export default apiRequest;
