import {createContext, ReactNode, useEffect, useState} from "react";
import NavBar from "./NavBar";
import Drawer from "./Drawer";
import axios from "../lib/axios";
import {useSession} from "next-auth/react";

// noinspection JSUnusedLocalSymbols
export const Theme = createContext({
  theme: 'dark', setTheme: (value: string) => {
  }
});

export default function Layout({children}: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>('dark');
  const {status} = useSession()

  const setTheme: (value: string) => void = (value: string) => {
    setThemeState(value);
    localStorage.setItem("theme", value);
  };

  useEffect(() => {
    const localTheme = localStorage.getItem("theme");
    if (localTheme) {
      setThemeState(localTheme);
    } else if (status === "authenticated") {
      axios.get('/settings').then(res => {
        setTheme(res.data.userData.settings.theme)
      })
    }
  }, [status]);

  return (
      <Theme.Provider value={{theme, setTheme}}>
        <div data-theme={theme} className="min-h-screen min-w-screen">
          <Drawer>
            <NavBar/>
            {children}
          </Drawer>
        </div>
      </Theme.Provider>
  )
}
