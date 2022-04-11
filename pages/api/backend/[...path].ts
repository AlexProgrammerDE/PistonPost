import type { NextApiRequest, NextApiResponse } from 'next'
import axios, {Method} from "axios";
import {getToken} from "next-auth/jwt";

// noinspection JSUnusedGlobalSymbols
export default async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({req: req, raw: true});

  const path = req.query.path as string[];
  delete req.query.path;

  const url = `http://localhost:5757/application/${path.join("/")}`;

  await axios.request({
    url: url,
    method: req.method! as Method,
    params: req.query,
    data: req.body,
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(response => {
      res.status(response.status).json(response.data);
    })
    .catch(error => {
      res.status(502).send(error);
    });
}
