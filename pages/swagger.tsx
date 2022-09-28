import { GlobalHead } from "components/GlobalHead";
import "swagger-ui-react/swagger-ui.css";
import dynamic from "next/dynamic";
import { useEffect } from "react";

const SwaggerUI = dynamic(import("swagger-ui-react"), { ssr: false });

export default function Swagger() {
  useEffect(() => {
    document.getElementsByTagName("html")[0].className = "bg-white";
  }, []);

  return (
    <>
      <GlobalHead />
      <div className="bg-white">
        <SwaggerUI url="/backend/openapi.json" />
      </div>
    </>
  );
}
