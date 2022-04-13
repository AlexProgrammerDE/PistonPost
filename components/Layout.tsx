import {createContext, ReactNode, useCallback, useEffect, useState} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";
import axios from "../lib/axios";
import defaultAxios from "axios";
import {useSession} from "next-auth/react";

interface HealthResponse {
  [key: string]: {
    healthy: boolean;
    message: string;
    duration: number;
    timestamp: string;
  }
}

// noinspection JSUnusedLocalSymbols
export const Theme = createContext({
  theme: 'dark', setTheme: (value: string) => {
  }
});

function setThemeTag(theme: string) {
  const themeTag = document.getElementById('documentBody')!;

  themeTag.setAttribute('data-theme', theme);
}

function getThemeTag() {
  const themeTag = document.getElementById('documentBody')!;

  return themeTag.getAttribute('data-theme')!;
}

export default function Layout({children}: { children: ReactNode }) {
  const [theme, setThemeState] = useState('placeholder');
  const [badHealth, setBadHealth] = useState(false);
  const {status} = useSession()

  useEffect(() => {
    if (theme !== 'placeholder') {
      setThemeTag(theme);
    } else {
      setThemeState(getThemeTag());
    }
  }, [theme])

  const setTheme = useCallback((value: string) => {
    setThemeState(value)
    setThemeTag(value);
    localStorage.setItem("theme", value);
  }, [setThemeState]);

  useEffect(() => {
    if (status === "authenticated") {
      axios.get('/settings').then(res => {
        setTheme(res.data.settings.theme)
      })
    }
  }, [status, setTheme]);

  useEffect(() => {
    defaultAxios.get('/api/health').then(res => {
      const health: HealthResponse = res.data;

      for (const key in health) {
        if (!health[key].healthy) {
          setBadHealth(true);
          break;
        }
      }

      if (badHealth) {
        setBadHealth(false);
      }
    }).catch(() => {
      setBadHealth(true);
    })
  }, [badHealth]);

  return (
      <Theme.Provider value={{theme, setTheme}}>
        <div className="min-h-screen min-w-screen">
          {badHealth && <div className="alert alert-error rounded-none shadow-lg">
              <div className="container flex flex-row justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6 animate-spin"
                       fill="none"
                       viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                              strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Core services seem to currently have issues... Please contact an administrator.</span>
              </div>
          </div>
          }

          <Drawer>
            <NavBar/>
            {children}
          </Drawer>
        </div>
      </Theme.Provider>
  )
}
