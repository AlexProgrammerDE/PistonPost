import { NextPage } from "next";

export type CustomNextPage = NextPage & { auth?: boolean };
