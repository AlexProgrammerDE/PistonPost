import {MongoClient} from "mongodb";

declare global {
  // noinspection ES6ConvertVarToLetConst
  var _mongoClientPromise: Promise<MongoClient>;
}
