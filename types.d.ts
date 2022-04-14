import { MongoClient } from "mongodb";

declare global {
  // noinspection ES6ConvertVarToLetConst
  var _mongoClientPromise: Promise<MongoClient>;
  // noinspection ES6ConvertVarToLetConst
  var _hasSetTime: boolean;
}
