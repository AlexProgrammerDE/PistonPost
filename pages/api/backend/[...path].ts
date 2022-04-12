import type {NextApiRequest, NextApiResponse} from 'next'
import axios, {Method} from "axios";
import {getToken} from "next-auth/jwt";
import getRawBody from "raw-body";

export const config = {
  api: {
    bodyParser: false,
  },
}

// noinspection JSUnusedGlobalSymbols
export default async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({req: req, raw: true});

  const path = req.query.path as string[];
  delete req.query.path;

  const url = `http://localhost:5757/application/${path.join("/")}`;

  const rawBody = await getRawBody(req)
  await axios.request({
    url: url,
    method: req.method! as Method,
    params: req.query,
    data: rawBody,
    headers: {
      ...req.headers as any,
      Authorization: `Bearer ${token}`
    }
  })
      .then(response => {
        res.status(response.status).json(response.data);
      })
      .catch(error => {
        console.error(error)
        res.status(error.response.status).send(error.response.statusText);
      });
}
