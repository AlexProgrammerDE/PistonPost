import { GlobalHead } from "../components/GlobalHead";
import "swagger-ui-react/swagger-ui.css";
import dynamic from "next/dynamic";

const SwaggerUI = dynamic(import("swagger-ui-react"), { ssr: false });

export default function Swagger() {
  return (
    <>
      <GlobalHead />
      <SwaggerUI url="/api/backend/openapi.json" />
    </>
  );
}
