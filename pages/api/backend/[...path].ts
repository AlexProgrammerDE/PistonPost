import type { NextApiRequest, NextApiResponse } from "next";
import axios, { Method } from "axios";
import { getToken } from "next-auth/jwt";
import getRawBody from "raw-body";

export const config = {
  api: {
    bodyParser: false
  }
};

const apiRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req: req, raw: true });

  const path = req.query.path as string[];
  delete req.query.path;

  const url = `${process.env.API_ENDPOINT}/${path.join("/")}`;

  const headers = token
    ? {
        ...(req.headers as any),
        Authorization: `Bearer ${token}`,
        "X-Forwarded-For": req.socket.remoteAddress
      }
    : {
        ...(req.headers as any),
        "X-Forwarded-For": req.socket.remoteAddress
      };

  const rawBody = await getRawBody(req);
  await axios
    .request({
      url: url,
      method: req.method! as Method,
      params: req.query,
      data: rawBody,
      headers
    })
    .then((response) => {
      res.setHeader("Content-Type", response.headers["content-type"]);

      res.status(response.status).send(response.data);
    })
    .catch((error) => {
      console.error(error);
      res.status(error.response.status).send(error.response.data);
    });
};

// noinspection JSUnusedGlobalSymbols
export default apiRequest;
