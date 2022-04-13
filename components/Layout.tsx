import {createContext, ReactNode, useCallback, useEffect, useState} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";
import axios from "../lib/axios";
import {useSession} from "next-auth/react";

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
        setTheme(res.data.userData.settings.theme)
      })
    }
  }, [status, setTheme]);

  return (
      <Theme.Provider value={{theme, setTheme}}>
        <div className="min-h-screen min-w-screen">
          <Drawer>
            <NavBar/>
            {children}
          </Drawer>
        </div>
      </Theme.Provider>
  )
}
