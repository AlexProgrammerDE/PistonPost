import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useState
} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";
import { useSession } from "next-auth/react";
import { AccountSettings, HealthResponse } from "lib/responses";
import Footer from "./Footer";
import useSWR from "swr";
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({
  display: "swap",
  subsets: ["latin", "latin-ext"],
})

// noinspection JSUnusedLocalSymbols
export const Theme = createContext({
  theme: "dark",
  setTheme: (value: string) => {}
});

function setThemeTag(theme: string) {
  const themeTag = document.getElementById("documentBody")!;

  themeTag.setAttribute("data-theme", theme);
}

function getThemeTag() {
  const themeTag = document.getElementById("documentBody")!;

  return themeTag.getAttribute("data-theme")!;
}

export default function Layout({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState("placeholder");
  const { data: healthData, error: healthError } = useSWR<HealthResponse>(
    "/api/health",
    (url) => fetch(url).then((res) => res.json()),
    { refreshInterval: 5000 }
  );
  const { status } = useSession();
  const { data: settingsData } = useSWR<AccountSettings>(
    status === "authenticated" ? "/settings" : null,
    { refreshInterval: 5000 }
  );

  let badHealth = false;
  if (healthError) {
    badHealth = true;
  } else if (healthData) {
    for (const key in healthData) {
      if (!healthData[key].healthy) {
        badHealth = true;
        break;
      }
    }
  }

  useEffect(() => {
    if (theme !== "placeholder") {
      setThemeTag(theme);
    } else {
      setThemeState(getThemeTag());
    }
  }, [theme]);

  const setTheme = useCallback(
    (value: string) => {
      setThemeState(value);
      setThemeTag(value);
      localStorage.setItem("theme", value);
    },
    [setThemeState]
  );

  useEffect(() => {
    if (settingsData && settingsData.settings && settingsData.settings.theme) {
      setTheme(settingsData.settings.theme);
    }
  }, [settingsData, setTheme]);

  return (
    <Theme.Provider value={{ theme, setTheme }}>
      <div className={`min-w-screen min-h-screen flex flex-col ${montserrat.className}`}>
        {badHealth && (
          <div className="alert alert-error rounded-none shadow-lg">
            <div className="container flex flex-row justify-center gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 flex-shrink-0 animate-spin stroke-current"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span>
                Core services seem to currently have issues... Please contact an
                administrator.
              </span>
            </div>
          </div>
        )}

        <Drawer>
          <NavBar />
          {children}
          <Footer />
        </Drawer>
      </div>
    </Theme.Provider>
  );
}
